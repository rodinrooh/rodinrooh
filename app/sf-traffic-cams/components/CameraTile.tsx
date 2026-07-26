"use client"

import { memo, useEffect, useRef, useState } from "react"
import type { Camera } from "@/lib/types-traffic-cams"
import { useOnScreen } from "./useOnScreen"

// Caltrans streams often hang instead of cleanly erroring — if playback hasn't
// started by this point, treat the stream as dead and fall back to the photo.
const WATCHDOG_MS = 8_000

type Mode = "loading" | "video" | "image"

function CameraTileInner({ camera }: { camera: Camera }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const isVisible = useOnScreen(containerRef)

  const [mode, setMode] = useState<Mode>(camera.videoUrl ? "video" : "image")
  const [cacheBust, setCacheBust] = useState(0)

  // mode never transitions back to "video" once it falls back, so this also
  // doubles as "don't retry a stream we already know is bad this session."
  const fallback = () => {
    setMode(camera.imageUrl ? "image" : "loading")
  }

  // Video path: attach hls.js (or native HLS on Safari) only while on-screen,
  // tear it down the moment the tile scrolls off — this is what bounds how
  // many concurrent connections we open to Caltrans regardless of grid size.
  useEffect(() => {
    if (!isVisible || mode !== "video" || !camera.videoUrl) return
    const video = videoRef.current
    if (!video) return

    let cancelled = false
    let hlsInstance: import("hls.js").default | null = null
    const watchdog = setTimeout(() => {
      if (!cancelled) fallback()
    }, WATCHDOG_MS)

    function onReady() {
      clearTimeout(watchdog)
      video?.play().catch(() => {})
    }
    function onError() {
      clearTimeout(watchdog)
      if (!cancelled) fallback()
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari: native HLS, no library needed.
      video.src = camera.videoUrl
      video.addEventListener("loadedmetadata", onReady)
      video.addEventListener("error", onError)
    } else {
      import("hls.js").then(({ default: Hls }) => {
        if (cancelled) return
        if (!Hls.isSupported()) {
          fallback()
          return
        }
        hlsInstance = new Hls()
        hlsInstance.on(Hls.Events.MANIFEST_PARSED, onReady)
        hlsInstance.on(Hls.Events.ERROR, (_evt, data) => {
          if (data.fatal) onError()
        })
        hlsInstance.loadSource(camera.videoUrl!)
        hlsInstance.attachMedia(video)
      })
    }

    return () => {
      cancelled = true
      clearTimeout(watchdog)
      video.removeEventListener("loadedmetadata", onReady)
      video.removeEventListener("error", onError)
      hlsInstance?.destroy()
      video.removeAttribute("src")
      video.load()
    }
  }, [isVisible, mode, camera.videoUrl])

  // Image path: only poll for a fresh frame while on-screen.
  useEffect(() => {
    if (!isVisible || mode !== "image") return
    const id = setInterval(() => setCacheBust((n) => n + 1), camera.imageRefreshMs)
    return () => clearInterval(id)
  }, [isVisible, mode, camera.imageRefreshMs])

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "16 / 9",
        background: "#111",
        borderRadius: 10,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {mode === "video" && (
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
          src={`${camera.imageUrl}?_=${cacheBust}`}
          alt={camera.name}
          loading="lazy"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      )}

      {mode === "loading" && <div style={{ width: "100%", height: "100%" }} />}

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
        {mode === "video" ? "LIVE" : "PHOTO"}
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
    a.imageRefreshMs === b.imageRefreshMs
  )
})

export default CameraTile
