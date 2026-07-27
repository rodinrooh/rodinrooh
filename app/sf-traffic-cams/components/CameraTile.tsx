"use client"

import { memo, useEffect, useRef, useState } from "react"
import type { Camera } from "@/lib/types-traffic-cams"
import { useOnScreen } from "./useOnScreen"
import { acquireHlsSlot } from "./hlsSemaphore"
import { registerPaused, unregisterPaused } from "./pausedRegistry"

// Two sequential budgets instead of one: negotiating (slot acquired up to
// the manifest parsing) either resolves fast or hangs, per real measurement;
// buffering (manifest parsed up to an actual frame rendering) is a separate,
// shorter budget for a stream that looked fine but never really started.
const WATCHDOG_NEGOTIATE_MS = 3_000
// Real measurement (see comment history / memory): Caltrans segments are
// ~10-11s each, so hls.js often needs several seconds after the manifest
// parses before it has buffered enough of one segment to actually start
// playing — real successes observed firing `playing` 5-9s after
// MANIFEST_PARSED, not the ~1s a naive read of "manifest parsed" would
// suggest. 9s gives real streams room to finish that first segment while
// still cutting off ones that are genuinely stalled.
const WATCHDOG_BUFFER_MS = 9_000

// How long a confirmed-live tile keeps its connection alive (paused, not
// destroyed) after scrolling off-screen, so scrolling back is instant.
const PAUSE_GRACE_MS = 60_000

// hls.js has its own internal stall detection, but it's slow — real
// measurement (12-minute production observation) caught 5 separate stalls
// (readyState stuck at 2, currentTime frozen, still badged LIVE) that each
// took 5-10s between the freeze starting and hls.js finally reporting a
// fatal error. Watching currentTime ourselves catches it much sooner.
const STALL_CHECK_MS = 2_000
const STALL_MAX_MISSES = 2 // ~4s of zero progress before treating it as dead

const RECENT_LIVE_KEY = "sf-traffic-cams:recentLive"
const RECENT_LIVE_WINDOW_MS = 30 * 60 * 1000
const RECENT_LIVE_MAX_ENTRIES = 300

function readRecentLive(): Record<string, number> {
  try {
    const raw = localStorage.getItem(RECENT_LIVE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function wasRecentlyLive(id: string): boolean {
  const ts = readRecentLive()[id]
  return typeof ts === "number" && Date.now() - ts < RECENT_LIVE_WINDOW_MS
}

function markRecentlyLive(id: string): void {
  try {
    const record = readRecentLive()
    record[id] = Date.now()
    const pruned = Object.fromEntries(
      Object.entries(record)
        .sort((a, b) => b[1] - a[1])
        .slice(0, RECENT_LIVE_MAX_ENTRIES)
    )
    localStorage.setItem(RECENT_LIVE_KEY, JSON.stringify(pruned))
  } catch {
    // localStorage unavailable (private mode, quota) — priority is a nice-to-
    // have, not required, so just skip recording it.
  }
}

type Mode = "loading" | "buffering" | "video" | "dead"

function CameraTileInner({
  camera,
  liveOnly,
  onModeChange,
}: {
  camera: Camera
  liveOnly: boolean
  onModeChange?: (id: string, mode: Mode) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const isVisible = useOnScreen(containerRef)

  const [mode, setMode] = useState<Mode>("loading")
  const [isDead, setIsDead] = useState(false)

  // Read inside effects without being a dependency of them — several of
  // these transitions must not retrigger the effect that caused them (a past
  // bug: `mode` in the attach effect's deps meant a successful attach tore
  // itself down the instant it flipped to "video").
  const modeRef = useRef(mode)
  modeRef.current = mode
  const isDeadRef = useRef(isDead)
  isDeadRef.current = isDead

  // Persist across isVisible toggles — these represent the *current attempt*
  // (or live connection), not something scoped to a single effect run.
  const hlsInstanceRef = useRef<import("hls.js").default | null>(null)
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stallWatcherRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const detachListenersRef = useRef<(() => void) | null>(null)
  // Cancels only the *current in-flight negotiation attempt* — set fresh by
  // startNegotiation() each time it's called (which can happen more than
  // once per tile: scroll off before succeeding, scroll back, retry). NOT a
  // long-lived "has this tile ever been superseded" flag — it must not block
  // the hls.js ERROR handler from ever firing again after the first scroll,
  // which is what a single shared ref reused across every visibility toggle
  // would do (found while writing this, before it ever shipped: a stream
  // that failed post-success would look permanently "live" and never
  // tear down or self-remove).
  const cancelAttemptRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    onModeChange?.(camera.id, mode)
  }, [camera.id, mode, onModeChange])

  function stopStallWatcher() {
    if (stallWatcherRef.current) {
      clearInterval(stallWatcherRef.current)
      stallWatcherRef.current = null
    }
  }

  // Starts fresh each time playback actually begins — both the initial
  // success and a resume-from-pause (video.play() after scrolling back
  // within the grace window also fires the native 'playing' event, which
  // calls this again) — so there's never stale state from a previous run.
  function startStallWatcher() {
    stopStallWatcher()
    let lastTime = -1
    let misses = 0
    stallWatcherRef.current = setInterval(() => {
      const video = videoRef.current
      // Deliberately paused (scroll-off grace window) — not a stall.
      if (!video || video.paused) return
      if (Math.abs(video.currentTime - lastTime) < 0.05) {
        misses++
        if (misses >= STALL_MAX_MISSES) {
          stopStallWatcher()
          die()
          return
        }
      } else {
        misses = 0
      }
      lastTime = video.currentTime
    }, STALL_CHECK_MS)
  }

  function fullTeardown() {
    cancelAttemptRef.current?.()
    cancelAttemptRef.current = null
    stopStallWatcher()
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current)
      watchdogRef.current = null
    }
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current)
      pauseTimerRef.current = null
    }
    unregisterPaused(camera.id)
    detachListenersRef.current?.()
    detachListenersRef.current = null
    hlsInstanceRef.current?.destroy()
    hlsInstanceRef.current = null
    const video = videoRef.current
    if (video) {
      video.removeAttribute("src")
      video.load()
    }
  }

  function die() {
    fullTeardown()
    setMode("dead")
    isDeadRef.current = true
    setIsDead(true)
  }

  function startNegotiation() {
    const video = videoRef.current
    if (!video) return

    // Scoped to exactly this attempt — only guards the two async `.then()`
    // chains below, which run regardless of instance/listener state. Once an
    // hls.js instance exists, its own destroy() unsubscribes its listeners,
    // and detachListenersRef removes the native <video> ones — so nothing
    // else needs this flag, and it never needs to gate the ERROR handler.
    let cancelled = false

    function onManifestParsed() {
      if (watchdogRef.current) clearTimeout(watchdogRef.current)
      setMode("buffering")
      video!.play().catch(() => {})
      watchdogRef.current = setTimeout(die, WATCHDOG_BUFFER_MS)
    }
    function onPlaying() {
      if (watchdogRef.current) {
        clearTimeout(watchdogRef.current)
        watchdogRef.current = null
      }
      setMode("video")
      markRecentlyLive(camera.id)
      startStallWatcher()
    }

    detachListenersRef.current = () => {
      video.removeEventListener("playing", onPlaying)
      video.removeEventListener("loadedmetadata", onManifestParsed)
    }

    const priority = wasRecentlyLive(camera.id)
    const ticket = acquireHlsSlot(priority)
    cancelAttemptRef.current = () => {
      cancelled = true
      ticket.cancel()
    }

    ticket.promise.then((release) => {
      if (cancelled) {
        release()
        return
      }
      let releaseSlot: (() => void) | null = release
      watchdogRef.current = setTimeout(() => {
        releaseSlot?.()
        releaseSlot = null
        die()
      }, WATCHDOG_NEGOTIATE_MS)

      const releaseOnceManifestParsed = () => {
        releaseSlot?.()
        releaseSlot = null
        onManifestParsed()
      }

      import("hls.js").then(({ default: Hls }) => {
        if (cancelled) {
          releaseSlot?.()
          return
        }
        // Prefer hls.js (MediaSource-based) wherever supported — this must be
        // checked *before* falling back to canPlayType(): Chrome's <video>
        // returns the truthy string "maybe" for the HLS MIME type despite
        // having no native HLS demuxer, so checking canPlayType first sends
        // Chrome down a dead-end path that never fires any event at all.
        if (Hls.isSupported()) {
          const hls = new Hls()
          hlsInstanceRef.current = hls
          hls.on(Hls.Events.MANIFEST_PARSED, releaseOnceManifestParsed)
          hls.on(Hls.Events.ERROR, (_evt, data) => {
            if (!data.fatal) return
            releaseSlot?.()
            releaseSlot = null
            die()
          })
          hls.loadSource(camera.videoUrl)
          hls.attachMedia(video)
          video.addEventListener("playing", onPlaying)
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = camera.videoUrl
          video.addEventListener("loadedmetadata", releaseOnceManifestParsed)
          video.addEventListener("playing", onPlaying)
          video.addEventListener("error", () => {
            releaseSlot?.()
            releaseSlot = null
            die()
          })
        } else {
          releaseSlot?.()
          releaseSlot = null
          die()
        }
      })
    })
  }

  // Drives every transition: fresh negotiation, resume-from-pause, pause-on-
  // scroll-off, or immediate teardown — branching on the *current* mode via
  // a ref rather than depending on `mode`, so a transition this effect
  // triggers (e.g. negotiation succeeding) never re-fires the same effect.
  useEffect(() => {
    if (isDeadRef.current) return
    const video = videoRef.current
    if (!video) return

    if (isVisible) {
      if (modeRef.current === "video") {
        unregisterPaused(camera.id)
        if (pauseTimerRef.current) {
          clearTimeout(pauseTimerRef.current)
          pauseTimerRef.current = null
        }
        video.play().catch(() => {})
      } else {
        startNegotiation()
      }
    } else {
      if (modeRef.current === "video") {
        video.pause()
        stopStallWatcher()
        registerPaused(camera.id, fullTeardown)
        pauseTimerRef.current = setTimeout(() => {
          unregisterPaused(camera.id)
          fullTeardown()
        }, PAUSE_GRACE_MS)
      } else {
        fullTeardown()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, camera.videoUrl])

  // Guarantees cleanup on true unmount (not just an isVisible toggle, which
  // the effect above already handles explicitly).
  useEffect(() => {
    return () => fullTeardown()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (isDead) return null

  const hiddenByFilter = liveOnly && mode !== "video"
  const label = mode === "video" ? "LIVE" : mode === "buffering" ? "BUFFERING" : "CONNECTING"

  return (
    <div
      ref={containerRef}
      style={{
        display: hiddenByFilter ? "none" : undefined,
        position: "relative",
        width: "100%",
        aspectRatio: "16 / 9",
        background: "#111",
        borderRadius: 10,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <video
        ref={videoRef}
        muted
        autoPlay
        playsInline
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />

      {mode !== "video" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(90deg, #111 25%, #1a1a1c 37%, #111 63%)",
            backgroundSize: "400% 100%",
            animation: "camPulse 1.6s ease-in-out infinite",
          }}
        />
      )}

      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          padding: "3px 7px",
          borderRadius: 6,
          background: "rgba(18,18,20,0.72)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.04em",
          color: mode === "video" ? "#3ddc63" : "#8e8e93",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: mode === "video" ? "#3ddc63" : "#8e8e93",
            boxShadow: mode === "video" ? "0 0 6px #3ddc63" : "none",
          }}
        />
        {label}
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "18px 10px 8px",
          background: "linear-gradient(to top, rgba(8,8,10,0.85), transparent)",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#fff",
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {camera.name}
        </div>
        {(camera.route || camera.direction) && (
          <div style={{ fontSize: 10.5, color: "#a1a1a6", marginTop: 1 }}>
            {[camera.route, camera.direction].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
    </div>
  )
}

const CameraTile = memo(CameraTileInner, (prev, next) => {
  const a = prev.camera
  const b = next.camera
  return (
    a.id === b.id &&
    a.videoUrl === b.videoUrl &&
    prev.liveOnly === next.liveOnly &&
    prev.onModeChange === next.onModeChange
  )
})

export default CameraTile
export type { Mode }
