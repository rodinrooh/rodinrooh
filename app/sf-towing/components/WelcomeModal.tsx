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
      const seen = sessionStorage.getItem("welcome-seen")
      if (!seen) setInternalOpen(true)
    }
  }, [openProp])

  const open = openProp !== undefined ? openProp : internalOpen

  function dismiss() {
    if (onCloseProp) {
      onCloseProp()
    } else {
      sessionStorage.setItem("welcome-seen", "1")
      setInternalOpen(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)" }}
    >
      <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: "#ffffff", boxShadow: "0 24px 80px rgba(0,0,0,0.18)" }}>
        <div className="flex flex-col items-center pt-8 pb-4 px-6">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-4" style={{ background: "linear-gradient(145deg, #ff3b30, #ff6b35)" }}>
            🚗
          </div>
          <h1 className="text-[19px] font-bold text-[#1c1c1e] text-center tracking-tight">Find My Towed Car</h1>
          <p className="text-sm text-[#8e8e93] text-center mt-1">San Francisco, live</p>
        </div>
        <div style={{ height: 1, background: "#f2f2f7" }} />
        <div className="px-6 py-5 space-y-4">
          <Row icon="📍" title="What is this?" body="Every car being towed in SF right now, on a live map. Updated every 5 minutes." />
          <Row icon="🤫" title="Where's the data from?" body="AutoReturn manages SF's impound lots. Their search portal is publicly accessible with no login required. We check it every 5 minutes." />
          <Row
            icon="🫡"
            title="Inspired by"
            body={<><a href="https://walzr.com/" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#007aff]">Riley Walz</a>{" and his "}<a href="https://walzr.com/sf-parking/" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#007aff]">Find My Parking Cops</a>{"."}</>}
          />
        </div>
        <div style={{ height: 1, background: "#f2f2f7" }} />
        <div className="px-6 py-4">
          <button onClick={dismiss} className="w-full py-3 rounded-xl text-white text-[15px] font-semibold transition-opacity active:opacity-75" style={{ background: "#007aff" }}>
            Find my (towed) car
          </button>
        </div>
        <p className="text-[10px] text-[#aeaeb2] text-center pb-4 px-6 leading-snug font-light">
          By{" "}
          <a href="https://x.com/rodinrooh" target="_blank" rel="noopener noreferrer" className="underline hover:text-[#007aff] transition-colors">
            Rodin Roohipour
          </a>
          . Not affiliated with the San Francisco government, Apple&apos;s Find My, or AutoReturn/Autura.
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
