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
      const seen = sessionStorage.getItem("meters-welcome-seen")
      if (!seen) setInternalOpen(true)
    }
  }, [openProp])

  const open = openProp !== undefined ? openProp : internalOpen

  function dismiss() {
    if (onCloseProp) {
      onCloseProp()
    } else {
      sessionStorage.setItem("meters-welcome-seen", "1")
      setInternalOpen(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.4)" }}
    >
      <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: "#ffffff", boxShadow: "0 24px 80px rgba(0,0,0,0.18)" }}>
        <div className="flex flex-col items-center pt-8 pb-4 px-6">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-4" style={{ background: "linear-gradient(to bottom, #22c55e, #15803d)" }}>
            🅿️
          </div>
          <h1 className="text-[19px] font-bold text-[#1c1c1e] text-center tracking-tight">SF Parking Meter Revenue</h1>
          <p className="text-sm text-[#8e8e93] text-center mt-1">San Francisco, live</p>
        </div>
        <div style={{ height: 1, background: "#f2f2f7" }} />
        <div className="px-6 py-5 space-y-4">
          <Row icon="💰" title="What is this?" body="Every parking meter session paid in SF, on a live map. See how much the city collects in real time." />
          <Row icon="📡" title="Data" body="Sourced from DataSF, SF's open data portal. There may be a short delay before new sessions appear." />
          <Row icon="🗺️" title="The map" body="Dots are color-coded by session cost — pale yellow is cheap, deep red is expensive." />
        </div>
        <div style={{ height: 1, background: "#f2f2f7" }} />
        <div className="px-6 py-4">
          <button onClick={dismiss} className="w-full py-3 rounded-xl text-white text-[15px] font-extrabold transition-opacity active:opacity-75" style={{ background: "#16a34a" }}>
            Show me the money
          </button>
        </div>
        <p className="text-[10px] text-[#8e8e93] text-center pb-4 px-6 leading-snug">
          By{" "}
          <a href="https://rodinrooh.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-[#16a34a] transition-colors">
            Rodin Roohipour
          </a>
          .{" "}
          Powered by{" "}
          <a href="https://whop.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-[#16a34a] transition-colors">
            Whop
          </a>
          .{" "}
          Not affiliated with the City of San Francisco or DataSF.
        </p>
      </div>
    </div>
  )
}

function Row({ icon, title, body }: { icon: string; title: string; body: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="text-xl mt-0.5 flex-shrink-0">{icon}</div>
      <div>
        <div className="text-[13px] font-semibold text-[#1c1c1e]">{title}</div>
        <div className="text-[13px] text-[#6d6d72] mt-0.5 leading-snug">{body}</div>
      </div>
    </div>
  )
}
