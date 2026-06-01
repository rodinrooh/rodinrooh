"use client"

import { useEffect, useState } from "react"

interface WelcomeModalProps {
  open?: boolean
  onClose?: () => void
}

export default function WelcomeModal({ open: openProp, onClose: onCloseProp }: WelcomeModalProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false)

  useEffect(() => {
    if (openProp === undefined) {
      const seen = sessionStorage.getItem("muni-welcome-seen")
      if (!seen) setInternalOpen(true)
    }
  }, [openProp])

  const open = openProp !== undefined ? openProp : internalOpen

  function dismiss() {
    if (onCloseProp) {
      onCloseProp()
    } else {
      sessionStorage.setItem("muni-welcome-seen", "1")
      setInternalOpen(false)
    }
  }

  if (!open) return null

  return (
    <div
      onClick={dismiss}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 400,
          borderRadius: 20,
          overflow: "hidden",
          background: "#ffffff",
          border: "1px solid rgba(0,0,0,0.06)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.25)",
          color: "#1c1c1e",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "30px 24px 16px" }}>
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 30,
              marginBottom: 16,
              background: "linear-gradient(145deg, #ff453a, #ff9f0a)",
            }}
          >
            🚍
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.03em", margin: 0 }}>SF Muni Latency</h1>
          <p style={{ fontSize: 13.5, color: "#8e8e93", margin: "4px 0 0", letterSpacing: "-0.01em" }}>San Francisco, live</p>
        </div>

        <div style={{ height: 1, background: "rgba(0,0,0,0.07)" }} />

        <div style={{ padding: "18px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          <Row icon="📍" title="What is this?" body="Every active Muni bus in San Francisco, right now. One dot per bus, colored by how far behind schedule it is." />
          <Row icon="🎨" title="Reading the map" body="Green is on time. Yellow and orange are slipping. Red is badly late. Tap any bus for its route and minutes behind." />
          <Row icon="🛰️" title="Where's the data from?" body="511 SF Bay's live transit feeds, refreshed about once a minute. Nothing is stored." />
        </div>

        <div style={{ height: 1, background: "rgba(0,0,0,0.07)" }} />

        <div style={{ padding: "16px 24px" }}>
          <button
            onClick={dismiss}
            style={{
              width: "100%",
              padding: "13px",
              borderRadius: 12,
              border: "none",
              background: "#1c1c1e",
              color: "#fff",
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              cursor: "pointer",
            }}
          >
            Show me the buses
          </button>
        </div>

        <p style={{ fontSize: 10.5, color: "#636366", textAlign: "center", padding: "0 24px 18px", lineHeight: 1.5, margin: 0 }}>
          By{" "}
          <a href="https://x.com/rodinrooh" target="_blank" rel="noopener noreferrer" style={{ color: "#8e8e93", textDecoration: "underline" }}>
            Rodin Roohipour
          </a>
          . Not affiliated with the SFMTA or Muni.
        </p>
      </div>
    </div>
  )
}

function Row({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <div style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: "-0.01em" }}>{title}</div>
        <div style={{ fontSize: 13, color: "#6b6b70", marginTop: 2, lineHeight: 1.45, letterSpacing: "-0.005em" }}>{body}</div>
      </div>
    </div>
  )
}
