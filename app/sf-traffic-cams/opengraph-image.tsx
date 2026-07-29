import { ImageResponse } from "next/og"

export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function OpengraphImage() {
  const tiles = new Array(9).fill(0)
  const liveIndex = 4

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#08080a",
          padding: 64,
        }}
      >
        <div style={{ display: "flex", gap: 10, marginBottom: 48 }}>
          {tiles.map((_, i) => (
            <div
              key={i}
              style={{
                width: 90,
                height: 90,
                borderRadius: 10,
                background: i === liveIndex ? "rgba(61,220,99,0.16)" : "#141416",
                border: i === liveIndex ? "1px solid #3ddc63" : "1px solid rgba(255,255,255,0.08)",
              }}
            />
          ))}
        </div>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 700, color: "#fff", letterSpacing: -2 }}>
          SF & LA Traffic Cams
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#8e8e93", marginTop: 14 }}>
          Live Caltrans video — real streaming, not stills
        </div>
      </div>
    ),
    { ...size }
  )
}
