"use client"

import type { Camera } from "@/lib/types-traffic-cams"
import CameraTile from "./CameraTile"

export default function CameraGrid({ cameras }: { cameras: Camera[] }) {
  if (cameras.length === 0) {
    return <div style={{ fontSize: 14, color: "#8e8e93", padding: "48px 0" }}>Feed unavailable.</div>
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 12,
      }}
    >
      {cameras.map((camera) => (
        <CameraTile key={camera.id} camera={camera} />
      ))}
    </div>
  )
}
