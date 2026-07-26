"use client"

type City = "sf" | "la"

const LABELS: Record<City, string> = { sf: "SF BAY", la: "LOS ANGELES" }

export default function CityToggle({
  city,
  onChange,
}: {
  city: City
  onChange: (city: City) => void
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: "max(16px, env(safe-area-inset-top))",
        left: 16,
        display: "flex",
        padding: 3,
        borderRadius: 10,
        background: "rgba(18,18,20,0.72)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "0 8px 40px rgba(0,0,0,0.45)",
        zIndex: 1,
      }}
    >
      {(["sf", "la"] as City[]).map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          style={{
            padding: "7px 14px",
            borderRadius: 7,
            border: "none",
            background: c === city ? "rgba(255,255,255,0.14)" : "transparent",
            color: c === city ? "#fff" : "#8e8e93",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.03em",
            cursor: "pointer",
          }}
        >
          {LABELS[c]}
        </button>
      ))}
    </div>
  )
}
