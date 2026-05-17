"use client"

import { useRef, useState } from "react"
import type { Tow } from "@/lib/types"
import CarList from "./CarList"
import Leaderboard from "./Leaderboard"
import WelcomeModal from "./WelcomeModal"

type Tab = "cars" | "leaderboard"

interface LeftPanelProps {
  tows: Tow[]
  loading: boolean
  selectedId: number | null
  onSelect: (tow: Tow) => void
  onFlyToStreet?: (lat: number, lng: number) => void
}

const GLASS: React.CSSProperties = {
  background: "rgba(255,255,255,0.82)",
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
}

export default function LeftPanel({ tows, selectedId, onSelect, onFlyToStreet }: LeftPanelProps) {
  const [tab, setTab] = useState<Tab>("cars")
  const [search, setSearch] = useState("")
  const [mobileExpanded, setMobileExpanded] = useState(false)
  const [showInfo, setShowInfo] = useState(false)

  const touchStartY = useRef(0)
  const touchStartedInList = useRef(false)
  const listRef = useRef<HTMLDivElement>(null)

  function onTouchStart(e: React.TouchEvent) {
    touchStartY.current = e.touches[0].clientY
    touchStartedInList.current = !!(listRef.current?.contains(e.target as Node))
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartedInList.current) return
    const delta = touchStartY.current - e.changedTouches[0].clientY
    if (delta > 40) setMobileExpanded(true)
    if (delta < -40) setMobileExpanded(false)
  }

  const filtered = search.trim()
    ? tows.filter((t) => (t.license ?? "").toLowerCase().includes(search.trim().toLowerCase()))
    : tows

  const body = (
    <>
      <div className="px-4 pt-2 pb-1">
        <input
          type="text"
          placeholder="Search by license plate…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-1.5 rounded-[10px] text-[13px] outline-none"
          style={{ background: "rgba(118,118,128,0.12)", color: "#1c1c1e" }}
        />
      </div>
      <div className="px-4 pt-2 pb-3">
        <div className="flex rounded-[10px] p-[3px]" style={{ background: "rgba(118,118,128,0.12)" }}>
          <TabButton active={tab === "cars"} onClick={() => setTab("cars")}>Cars</TabButton>
          <TabButton active={tab === "leaderboard"} onClick={() => setTab("leaderboard")}>Leaderboard</TabButton>
        </div>
      </div>
      <div ref={listRef} className="flex flex-col flex-1 overflow-hidden">
        {tab === "cars" ? (
          <CarList tows={filtered} selectedId={selectedId} onSelect={onSelect} />
        ) : (
          <Leaderboard tows={tows} onFlyToStreet={onFlyToStreet} />
        )}
      </div>
      <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
        <a href="https://walzr.com/sf-parking/" target="_blank" rel="noopener noreferrer" className="text-[12px] text-[#8e8e93] hover:text-[#007aff] transition-colors">
          Inspired by Riley Walz
        </a>
        <button
          onClick={() => setShowInfo(true)}
          className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold transition-opacity hover:opacity-70"
          style={{ background: "rgba(0,0,0,0.07)", color: "#8e8e93" }}
        >
          i
        </button>
      </div>
    </>
  )

  return (
    <>
      <div
        className="hidden md:flex absolute left-0 top-0 h-full flex-col"
        style={{ width: 320, borderRight: "1px solid rgba(0,0,0,0.1)", zIndex: 10, ...GLASS }}
      >
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ background: "#ff5f57" }} />
            <div className="w-3 h-3 rounded-full" style={{ background: "#febc2e" }} />
            <div className="w-3 h-3 rounded-full" style={{ background: "#28c840" }} />
          </div>
          <a
            href="https://x.com/rodinrooh"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-[10px] tracking-widest text-[#aeaeb2] hover:text-[#007aff] transition-colors"
            style={{ fontWeight: 300, letterSpacing: "0.12em" }}
          >
            A RODIN PRODUCTION
          </a>
        </div>
        {body}
      </div>

      <WelcomeModal open={showInfo} onClose={() => setShowInfo(false)} />

      <div
        className="md:hidden fixed bottom-0 left-0 right-0 flex flex-col rounded-t-[20px] overflow-hidden"
        style={{
          height: mobileExpanded ? "70vh" : 180,
          transition: "height 0.3s cubic-bezier(0.32,0.72,0,1)",
          boxShadow: "0 -2px 20px rgba(0,0,0,0.1)",
          zIndex: 10,
          ...GLASS,
        }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className="flex justify-center items-center flex-shrink-0" style={{ paddingTop: 10, paddingBottom: 10, minHeight: 44 }}>
          <div className="w-9 h-[5px] rounded-full bg-[#c7c7cc]" />
        </div>
        {body}
      </div>
    </>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 py-1.5 rounded-md text-sm font-medium transition-colors"
      style={{
        background: active ? "#ffffff" : "transparent",
        color: active ? "#1c1c1e" : "#8e8e93",
        boxShadow: active ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
      }}
    >
      {children}
    </button>
  )
}
