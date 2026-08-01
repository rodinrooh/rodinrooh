"use client"

import { memo, useEffect, useRef, useState } from "react"
import type { Camera } from "@/lib/types-traffic-cams"
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

// A confirmed-live tile demoted to standby is paused (not destroyed) so
// paging back to it is instant. There is deliberately no fixed timeout that
// tears it down after some elapsed time — that was tried and caused a real
// bug: sit on page 2 for a few minutes, then go back to page 1, and its
// tiles had already blindly expired on a clock even though nothing was
// actually competing for resources, forcing a full 3-12s reconnect for no
// reason. The only thing that should tear down a paused tile is genuine
// capacity pressure (see pausedRegistry's MAX_PAUSED eviction) or actually
// falling out of the mount window (more than one page away) — not a timer.

// hls.js has its own internal stall detection, but it's slow — real
// measurement (12-minute production observation) caught 5 separate stalls
// (readyState stuck at 2, currentTime frozen, still badged LIVE) that each
// took 5-10s between the freeze starting and hls.js finally reporting a
// fatal error. Watching currentTime ourselves catches it much sooner.
const STALL_CHECK_MS = 2_000
const STALL_MAX_MISSES = 2 // ~4s of zero progress before treating it as dead

type Mode = "loading" | "buffering" | "video" | "dead"
// "active" = the page currently on screen (negotiates fully, plays, high-
// priority slot). "standby" = an adjacent page (prev/next) kept mounted so
// paging there is instant — negotiates too (a real prefetch, not idle), but
// pauses itself the moment it reaches "video" instead of playing.
type Role = "active" | "standby"

function CameraTileInner({
  camera,
  role,
  liveOnly,
  onModeChange,
}: {
  camera: Camera
  role: Role
  liveOnly: boolean
  onModeChange?: (id: string, mode: Mode) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

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
  const roleRef = useRef(role)
  roleRef.current = role
  // True from the moment startNegotiation() kicks off an attempt until it
  // resolves (playing) or is torn down — guards against double-negotiating
  // when `role` flips mid-attempt (e.g. a standby prefetch gets promoted to
  // active before it's finished connecting; the in-flight attempt should
  // just keep going, not restart).
  const attemptInFlightRef = useRef(false)

  // Persist across role toggles — these represent the *current attempt*
  // (or live connection), not something scoped to a single effect run.
  const hlsInstanceRef = useRef<import("hls.js").default | null>(null)
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stallWatcherRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const detachListenersRef = useRef<(() => void) | null>(null)
  // Real 18-minute production observation caught intermittent CORS/403
  // failures on chunklist refresh that, in a couple of cases, drained an
  // already-live stream's buffer and killed it — but the same failure
  // signature was harmless on other cameras when a later retry succeeded
  // before the buffer ran dry. This flag caps the extra safety net below to
  // exactly one reconnect attempt per live stretch, so a genuinely,
  // repeatedly broken stream still gives up rather than retrying forever.
  const hasRetriedSinceLiveRef = useRef(false)
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
  // success and a resume-from-pause (video.play() after being promoted back
  // to active while still paused-standby also fires the native 'playing'
  // event, which calls this again) — so there's never stale state from a
  // previous run.
  function startStallWatcher() {
    stopStallWatcher()
    let lastTime = -1
    let misses = 0
    stallWatcherRef.current = setInterval(() => {
      const video = videoRef.current
      // Deliberately paused (standby grace window) — not a stall.
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
    attemptInFlightRef.current = false
    stopStallWatcher()
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current)
      watchdogRef.current = null
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

  // Pauses a confirmed-live tile without destroying its connection, and
  // registers it with the shared paused-tile registry (global capacity cap
  // — see pausedRegistry.ts) — used both when a tile that was active gets
  // demoted to standby (paged away from) and when a standby prefetch
  // reaches "video" on its own (it should sit ready, not actually play,
  // until promoted to active). No fixed grace timer here on purpose: it
  // stays paused-and-connected indefinitely until either genuine capacity
  // pressure evicts it or it actually falls out of the mount window.
  function pauseAsStandby() {
    const video = videoRef.current
    if (!video) return
    video.pause()
    stopStallWatcher()
    registerPaused(camera.id, () => {
      fullTeardown()
      setMode("loading")
    })
  }

  function startNegotiation() {
    const video = videoRef.current
    if (!video) return
    attemptInFlightRef.current = true

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
      attemptInFlightRef.current = false
      startStallWatcher()
      // A fresh successful stretch of playback earns its own fresh
      // one-reconnect allowance (see hasRetriedSinceLiveRef above).
      hasRetriedSinceLiveRef.current = false
      // A standby prefetch that just finished connecting shouldn't actually
      // play — pause it in place, ready for an instant resume the moment
      // it's promoted to active.
      if (roleRef.current === "standby") pauseAsStandby()
    }
    // If a fatal error hits a stream that already proved itself live, try
    // reconnecting once (identical to a fresh negotiation) instead of
    // giving up immediately — real evidence showed intermittent Caltrans-
    // side network blips can kill an established stream even though the
    // exact same blip is harmless when a subsequent attempt succeeds first.
    function onFatalWhilePlaying(): boolean {
      if (modeRef.current !== "video" || hasRetriedSinceLiveRef.current) return false
      hasRetriedSinceLiveRef.current = true
      fullTeardown()
      setMode("loading")
      startNegotiation()
      return true
    }

    detachListenersRef.current = () => {
      video.removeEventListener("playing", onPlaying)
      video.removeEventListener("loadedmetadata", onManifestParsed)
    }

    // Active (on-screen page) tiles always outrank standby (prefetch) ones
    // for a slot — a page you're actually looking at should never wait
    // behind a background prefetch for a neighboring page.
    const priority = roleRef.current === "active"
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
          // Real 18-minute production observation: intermittent Caltrans-
          // side CORS/403 failures on chunklist/segment refresh sometimes
          // exhaust hls.js's default retry budget (4 level / 6 frag retries)
          // within their typical ~10-20s failure window. Raising the retry
          // *count* (not delay/ceiling — those defaults are already a
          // generous 1s base / 64s ceiling per hls.js source) gives more
          // attempts spread across that existing backoff, a real chance to
          // clear before hls.js ever reports fatal.
          const hls = new Hls({
            levelLoadingMaxRetry: 8, // default 4
            fragLoadingMaxRetry: 8, // default 6
          })
          hlsInstanceRef.current = hls
          hls.on(Hls.Events.MANIFEST_PARSED, releaseOnceManifestParsed)
          hls.on(Hls.Events.ERROR, (_evt, data) => {
            if (!data.fatal) return
            releaseSlot?.()
            releaseSlot = null
            if (onFatalWhilePlaying()) return
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
            if (onFatalWhilePlaying()) return
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

  // Drives every transition: fresh negotiation/prefetch, resume-from-pause,
  // pause-on-demotion-to-standby — branching on the *current* mode via a ref
  // rather than depending on `mode`, so a transition this effect triggers
  // (e.g. negotiation succeeding) never re-fires the same effect. Note
  // "not yet video" is handled identically for both roles (start/continue a
  // negotiation, guarded by attemptInFlightRef so a role flip mid-attempt
  // doesn't double-negotiate) — the *fate* of that attempt (play vs.
  // pause-in-place) is decided later, in onPlaying(), by re-checking roleRef.
  useEffect(() => {
    if (isDeadRef.current) return
    const video = videoRef.current
    if (!video) return

    if (modeRef.current === "video") {
      if (role === "active") {
        unregisterPaused(camera.id)
        video.play().catch(() => {})
      } else {
        // Demoted from active to standby (paged away from) — pause but keep
        // the connection alive. Resetting `mode` to "loading" once an early
        // eviction via pausedRegistry's capacity cap actually tears it down
        // is handled inside pauseAsStandby()'s registerPaused callback —
        // without that reset, getting promoted back to active later would
        // just call video.play() on nothing (the branch above assumes
        // "video" means "just resume") and never reconnect.
        pauseAsStandby()
      }
    } else if (!attemptInFlightRef.current) {
      startNegotiation()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, camera.videoUrl])

  // Guarantees cleanup on true unmount (a page more than one step away —
  // not a promotion/demotion within the active/standby window, which the
  // effect above already handles explicitly). Deliberately does NOT report
  // a synthetic "dead" mode here — falling out of the mount window is a
  // neutral event (not a failure), and conflating the two is actively
  // dangerous: React Strict Mode's dev-only double-invoke calls this
  // cleanup once "for practice" on every single mount, which would falsely
  // mark every tile dead before it ever got a real chance to connect. The
  // parent derives its own "this id is no longer mounted" bookkeeping by
  // diffing its rendered tile set render-over-render instead (see
  // `page.tsx`), which is immune to this since it only reacts to an actual
  // change in what it chose to render.
  useEffect(() => {
    return () => fullTeardown()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (isDead) return null

  const hidden = role === "standby" || (liveOnly && mode !== "video")
  const label = mode === "video" ? "LIVE" : mode === "buffering" ? "BUFFERING" : "CONNECTING"

  return (
    <div
      ref={containerRef}
      style={{
        display: hidden ? "none" : undefined,
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
          className="cam-skeleton-pulse"
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(90deg, #111 25%, #1a1a1c 37%, #111 63%)",
            backgroundSize: "400% 100%",
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
    prev.role === next.role &&
    prev.liveOnly === next.liveOnly &&
    prev.onModeChange === next.onModeChange
  )
})

export default CameraTile
export type { Mode, Role }
