"use client"

import { memo, useEffect, useRef, useState } from "react"
import type { Camera } from "@/lib/types-traffic-cams"
import { useOnScreen } from "./useOnScreen"
import { acquireHlsSlot } from "./hlsSemaphore"
import { isCaltransPlaceholder } from "./detectPlaceholder"

// Real successes resolve in ~1s; real measurement showed every failure hangs
// for the *entire* watchdog duration rather than erroring early (Caltrans
// streams don't cleanly 404, they just stall) — so a shorter watchdog loses
// nothing genuine while cutting the worst-case stall by more than half.
const WATCHDOG_MS = 3_000

type Mode = "loading" | "video" | "image"

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
  const imgRef = useRef<HTMLImageElement>(null)
  const isVisible = useOnScreen(containerRef)

  const [mode, setMode] = useState<Mode>(camera.videoUrl ? "loading" : "image")
  const [cacheBust, setCacheBust] = useState(0)
  const [isPlaceholder, setIsPlaceholder] = useState(false)

  // mode never transitions back to "loading"/"video" once it falls back, so
  // this also doubles as "don't retry a stream we already know is bad this
  // session."
  const fallback = () => {
    setMode(camera.imageUrl ? "image" : "loading")
  }

  useEffect(() => {
    onModeChange?.(camera.id, mode)
  }, [camera.id, mode, onModeChange])

  // Video path: attach hls.js (or native HLS on Safari) only while on-screen,
  // tear it down the moment the tile scrolls off — this is what bounds how
  // many concurrent connections we open to Caltrans regardless of grid size.
  useEffect(() => {
    if (!isVisible || mode !== "loading" || !camera.videoUrl) return
    const video = videoRef.current
    if (!video) return

    let cancelled = false
    let hlsInstance: import("hls.js").default | null = null
    let releaseSlot: (() => void) | null = null
    let watchdog: ReturnType<typeof setTimeout> | null = null

    function onReady() {
      if (watchdog) clearTimeout(watchdog)
      if (!cancelled) setMode("video")
      video?.play().catch(() => {})
    }
    function onError() {
      if (watchdog) clearTimeout(watchdog)
      if (!cancelled) fallback()
    }

    const ticket = acquireHlsSlot()
    ticket.promise.then((release) => {
      if (cancelled) {
        release()
        return
      }
      releaseSlot = release
      watchdog = setTimeout(onError, WATCHDOG_MS)

      import("hls.js").then(({ default: Hls }) => {
        if (cancelled) return
        // Prefer hls.js (MediaSource-based) wherever supported — this must be
        // checked *before* falling back to canPlayType(): Chrome's <video>
        // returns the truthy string "maybe" for the HLS MIME type even though
        // it has no native HLS demuxer, so checking canPlayType first (as
        // most examples show, aimed at only distinguishing Safari) silently
        // sends Chrome down a dead-end path that never fires any event at all.
        if (Hls.isSupported()) {
          hlsInstance = new Hls()
          hlsInstance.on(Hls.Events.MANIFEST_PARSED, onReady)
          hlsInstance.on(Hls.Events.ERROR, (_evt, data) => {
            if (data.fatal) onError()
          })
          hlsInstance.loadSource(camera.videoUrl!)
          hlsInstance.attachMedia(video)
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = camera.videoUrl!
          video.addEventListener("loadedmetadata", onReady)
          video.addEventListener("error", onError)
        } else {
          onError()
        }
      })
    })

    return () => {
      cancelled = true
      ticket.cancel()
      if (watchdog) clearTimeout(watchdog)
      video.removeEventListener("loadedmetadata", onReady)
      video.removeEventListener("error", onError)
      hlsInstance?.destroy()
      video.removeAttribute("src")
      video.load()
      releaseSlot?.()
    }
  }, [isVisible, mode, camera.videoUrl])

  // Image path: only poll for a fresh frame while on-screen.
  useEffect(() => {
    if (!isVisible || mode !== "image") return
    const id = setInterval(() => setCacheBust((n) => n + 1), camera.imageRefreshMs)
    return () => clearInterval(id)
  }, [isVisible, mode, camera.imageRefreshMs])

  // Caltrans serves its "Temporarily Unavailable" graphic from the same URL
  // as a real photo (200 OK, valid JPEG) with no flag for it anywhere in the
  // feed — checked after each load, on the actual pixels.
  const handleImageLoad = () => {
    const img = imgRef.current
    setIsPlaceholder(!!img && isCaltransPlaceholder(img))
  }

  // Only hide tiles that have actually settled on "not live" — a tile still
  // connecting might yet become live, so it stays visible (with its loading
  // skeleton) rather than disappearing and possibly popping back in.
  const hiddenByFilter = liveOnly && mode === "image"
  const showAsUnavailable = mode === "image" && isPlaceholder

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
      {(mode === "loading" || mode === "video") && camera.videoUrl && (
        <video
          ref={videoRef}
          muted
          autoPlay
          playsInline
          onError={fallback}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      )}

      {mode === "image" && camera.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={`${camera.imageUrl}?_=${cacheBust}`}
          alt={camera.name}
          crossOrigin="anonymous"
          onLoad={handleImageLoad}
          loading="lazy"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            visibility: showAsUnavailable ? "hidden" : "visible",
          }}
        />
      )}

      {showAsUnavailable && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            color: "#8e8e93",
            background: "#161618",
          }}
        >
          Camera unavailable
        </div>
      )}

      {mode === "loading" && (
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
        {mode === "video" ? "LIVE" : mode === "loading" ? "CONNECTING" : showAsUnavailable ? "OFFLINE" : "PHOTO"}
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
    a.imageUrl === b.imageUrl &&
    a.imageRefreshMs === b.imageRefreshMs &&
    prev.liveOnly === next.liveOnly &&
    prev.onModeChange === next.onModeChange
  )
})

export default CameraTile
export type { Mode }
