"use client"

import type { Camera } from "@/lib/types-traffic-cams"
import CameraTile, { type Mode, type Role } from "./CameraTile"

export default function CameraGrid({
  tiles,
  liveOnly,
  onModeChange,
}: {
  tiles: { camera: Camera; role: Role }[]
  liveOnly: boolean
  onModeChange?: (id: string, mode: Mode) => void
}) {
  if (tiles.length === 0) {
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
        {tiles.map(({ camera, role }) => (
          <CameraTile key={camera.id} camera={camera} role={role} liveOnly={liveOnly} onModeChange={onModeChange} />
        ))}
      </div>
    </>
  )
}
