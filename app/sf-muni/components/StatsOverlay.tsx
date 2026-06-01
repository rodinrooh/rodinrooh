"use client"

interface StatsOverlayProps {
  latePct: number
  avgDelayMin: number
  total: number
  loading: boolean
}

export default function StatsOverlay({ latePct, avgDelayMin, total, loading }: StatsOverlayProps) {
  return (
    <div
      style={{
        position: "absolute",
        top: "max(16px, env(safe-area-inset-top))",
        left: 16,
        right: 16,
        maxWidth: 340,
        padding: "16px 18px",
        borderRadius: 16,
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: "1px solid rgba(0,0,0,0.07)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        color: "#1c1c1e",
        pointerEvents: "none",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", color: "#8e8e93", textTransform: "uppercase" }}>
        SF Muni · Live
      </div>

      {loading ? (
        <div style={{ fontSize: 15, letterSpacing: "-0.01em", color: "#8e8e93", marginTop: 12 }}>
          Locating every bus…
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
            <span style={{ fontSize: "clamp(38px, 9vw, 54px)", fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1, color: "#ff453a" }}>
              {latePct}%
            </span>
            <span style={{ fontSize: 15, letterSpacing: "-0.01em", color: "#3a3a3c", fontWeight: 500 }}>
              of buses late
            </span>
          </div>

          <div style={{ display: "flex", gap: 18, marginTop: 14 }}>
            <Stat value={`${avgDelayMin.toFixed(1)}m`} label="avg delay" />
            <Stat value={`${total}`} label="active buses" />
          </div>

          <div style={{ fontSize: 11.5, lineHeight: 1.45, letterSpacing: "-0.005em", color: "#8e8e93", marginTop: 14 }}>
            Voters mandated 85% on-time in 1999. Muni has never hit it.
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11, letterSpacing: "0.04em", color: "#8e8e93", textTransform: "uppercase", marginTop: 3 }}>{label}</div>
    </div>
  )
}
