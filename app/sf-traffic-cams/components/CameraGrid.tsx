"use client"

import type { Camera } from "@/lib/types-traffic-cams"
import CameraTile, { type Mode, type Role } from "./CameraTile"

export default function CameraGrid({
  tiles,
  placeholderCount = 0,
  liveOnly,
  onModeChange,
}: {
  tiles: { camera: Camera; role: Role }[]
  placeholderCount?: number
  liveOnly: boolean
  onModeChange?: (id: string, mode: Mode) => void
}) {
  if (tiles.length === 0 && placeholderCount === 0) {
    return <div style={{ fontSize: 14, color: "#8e8e93", padding: "48px 0" }}>Feed unavailable.</div>
  }

  return (
    <>
      {/* Shared keyframes for the loading skeleton — declared once here rather
          than per-tile, since @keyframes rules apply globally by name anyway.
          Respects prefers-reduced-motion by freezing on a static mid-tone
          instead of animating, rather than just disabling the rule (which
          would leave the gradient stuck at its 100% starting position). */}
      <style>{`
        @keyframes camPulse {
          0% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .cam-skeleton-pulse {
          animation: camPulse 1.6s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .cam-skeleton-pulse {
            animation: none;
            background-position: 50% 50%;
          }
        }
      `}</style>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 12,
        }}
      >
        {tiles.map(({ camera, role }) => (
          <CameraTile key={camera.id} camera={camera} role={role} liveOnly={liveOnly} onModeChange={onModeChange} />
        ))}
        {Array.from({ length: placeholderCount }).map((_, i) => (
          <SkeletonPlaceholder key={`placeholder-${i}`} />
        ))}
      </div>
    </>
  )
}

// A slot the discovery scanner hasn't filled with a confirmed-live camera
// yet — visually identical to a real tile's own loading skeleton, so the
// grid always reads as a full page from the very first render instead of
// showing a shrinking/growing pile of tiles as they're discovered.
function SkeletonPlaceholder() {
  return (
    <div
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
      <div
        className="cam-skeleton-pulse"
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(90deg, #111 25%, #1a1a1c 37%, #111 63%)",
          backgroundSize: "400% 100%",
        }}
      />
    </div>
  )
}
