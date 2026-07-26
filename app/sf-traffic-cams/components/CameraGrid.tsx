"use client"

import type { Camera } from "@/lib/types-traffic-cams"
import CameraTile, { type Mode } from "./CameraTile"

export default function CameraGrid({
  cameras,
  liveOnly,
  onModeChange,
}: {
  cameras: Camera[]
  liveOnly: boolean
  onModeChange?: (id: string, mode: Mode) => void
}) {
  if (cameras.length === 0) {
    return <div style={{ fontSize: 14, color: "#8e8e93", padding: "48px 0" }}>Feed unavailable.</div>
  }

  return (
    <>
      {/* Shared keyframes for the loading skeleton — declared once here rather
          than per-tile, since @keyframes rules apply globally by name anyway. */}
      <style>{`
        @keyframes camPulse {
          0% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 12,
        }}
      >
        {cameras.map((camera) => (
          <CameraTile key={camera.id} camera={camera} liveOnly={liveOnly} onModeChange={onModeChange} />
        ))}
      </div>
    </>
  )
}
