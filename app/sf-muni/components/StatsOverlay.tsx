"use client"

interface StatsOverlayProps {
  latePct: number
  totalDelayMin: number
  total: number
  loading: boolean
}

export default function StatsOverlay({ latePct, totalDelayMin, total, loading }: StatsOverlayProps) {
  return (
    <div
      style={{
        position: "absolute",
        top: "max(14px, env(safe-area-inset-top))",
        left: 14,
        right: 14,
        maxWidth: 320,
        borderRadius: 18,
        background: "rgba(16,16,18,0.74)",
        backdropFilter: "blur(20px) saturate(140%)",
        WebkitBackdropFilter: "blur(20px) saturate(140%)",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "0 10px 44px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
        color: "#fff",
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      <style>{`@keyframes muniPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.7)}}`}</style>

      <div style={{ padding: "15px 18px 16px" }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#30d158", boxShadow: "0 0 6px #30d158", animation: "muniPulse 2s ease-in-out infinite" }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: "#fff" }}>SF MUNI</span>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.14em", color: "#6e6e76" }}>LATENCY</span>
        </div>

        {loading ? (
          <div style={{ fontSize: 14, letterSpacing: "-0.01em", color: "#8e8e93", marginTop: 16 }}>Locating every bus…</div>
        ) : (
          <>
            {/* headline */}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: "clamp(40px, 9vw, 52px)", fontWeight: 800, letterSpacing: "-0.045em", lineHeight: 0.95, color: "#ff453a" }}>
                {latePct}%
              </div>
              <div style={{ fontSize: 14, letterSpacing: "-0.015em", color: "#c7c7cc", marginTop: 7 }}>
                of {total.toLocaleString()} buses are late right now
              </div>
            </div>

            <div style={{ height: 1, background: "rgba(255,255,255,0.09)", margin: "15px 0" }} />

            {/* dramatic live-delay metric — label inline to the right */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
              <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.03em", color: "#fff", fontVariantNumeric: "tabular-nums" }}>
                {totalDelayMin.toLocaleString()}
              </span>
              <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: "-0.01em", color: "#8e8e93" }}>
                min of total delay
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
