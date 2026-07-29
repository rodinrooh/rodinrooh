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
      const seen = sessionStorage.getItem("traffic-cams-welcome-seen")
      if (!seen) setInternalOpen(true)
    }
  }, [openProp])

  const open = openProp !== undefined ? openProp : internalOpen

  function dismiss() {
    if (onCloseProp) {
      onCloseProp()
    } else {
      sessionStorage.setItem("traffic-cams-welcome-seen", "1")
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
          background: "#1a1a1c",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
          color: "#fff",
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
              background: "linear-gradient(145deg, #3ddc63, #1a1a1c)",
            }}
          >
            🚦
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.03em", margin: 0 }}>
            SF & LA Traffic Cams
          </h1>
          <p style={{ fontSize: 13.5, color: "#8e8e93", margin: "4px 0 0", letterSpacing: "-0.01em" }}>
            Live Caltrans video, real streaming
          </p>
        </div>

        <div style={{ height: 1, background: "rgba(255,255,255,0.07)" }} />

        <div style={{ padding: "18px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          <Row
            icon="📹"
            title="What is this?"
            body="Every live Caltrans traffic camera across the SF Bay Area and Los Angeles — real streaming video, not slow-refreshing stills."
          />
          <Row
            icon="🧱"
            title="Why only 9 at a time?"
            body="Like a real security monitor wall. Caltrans's own feed is down for a lot of cameras at any given moment — this app checks in the background and only ever shows you ones confirmed to actually be live, so a page never shows a dead tile."
          />
          <Row
            icon="🟢"
            title="Reading the badges"
            body="Green LIVE means it's streaming right now. Gray CONNECTING/BUFFERING means it's still negotiating. A fresh page can take a few seconds to fill in as cameras get checked."
          />
        </div>

        <div style={{ height: 1, background: "rgba(255,255,255,0.07)" }} />

        <div style={{ padding: "16px 24px" }}>
          <button
            onClick={dismiss}
            style={{
              width: "100%",
              padding: "13px",
              borderRadius: 12,
              border: "none",
              background: "#fff",
              color: "#111",
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: "-0.01em",
              cursor: "pointer",
            }}
          >
            Show me the cameras
          </button>
        </div>

        <p style={{ fontSize: 10.5, color: "#636366", textAlign: "center", padding: "0 24px 18px", lineHeight: 1.5, margin: 0 }}>
          By{" "}
          <a href="https://x.com/rodinrooh" target="_blank" rel="noopener noreferrer" style={{ color: "#8e8e93", textDecoration: "underline" }}>
            Rodin Roohipour
          </a>
          . Not affiliated with Caltrans.
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
        <div style={{ fontSize: 13, color: "#a1a1a6", marginTop: 2, lineHeight: 1.45, letterSpacing: "-0.005em" }}>
          {body}
        </div>
      </div>
    </div>
  )
}
