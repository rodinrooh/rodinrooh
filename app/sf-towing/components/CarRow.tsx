"use client"

import { useEffect, useState } from "react"
import { getStatusColor } from "@/lib/colorMap"
import type { Tow } from "@/lib/types"

function relativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hr${hrs !== 1 ? "s" : ""} ago`
  const days = Math.floor(hrs / 24)
  return `${days} day${days !== 1 ? "s" : ""} ago`
}

function makeInitials(make: string | null): string {
  if (!make) return "??"
  return make.slice(0, 2).toUpperCase()
}

function formatCarTitle(tow: Tow): string {
  return [tow.color, tow.year, tow.make, tow.model]
    .filter(Boolean)
    .map((v) => String(v))
    .join(" ")
}

interface CarRowProps {
  tow: Tow
  selected: boolean
  onClick: () => void
}

export default function CarRow({ tow, selected, onClick }: CarRowProps) {
  const [timeAgo, setTimeAgo] = useState(() => relativeTime(tow.towed_at))

  useEffect(() => {
    const interval = setInterval(() => setTimeAgo(relativeTime(tow.towed_at)), 60_000)
    return () => clearInterval(interval)
  }, [tow.towed_at])

  const statusColor = getStatusColor(tow.status)

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
        selected ? "bg-black/5" : "hover:bg-black/[0.03] active:bg-black/5"
      }`}
    >
      <div
        className="flex-shrink-0 w-[40px] h-[40px] rounded-full flex items-center justify-center"
        style={{
          background: "linear-gradient(145deg, #adb2be, #717585)",
          color: "#fff",
          boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
          fontSize: "15px",
          fontWeight: 350,
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
          letterSpacing: "0.5px",
        }}
      >
        {makeInitials(tow.make)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-semibold text-[#1c1c1e] truncate leading-tight">
          {formatCarTitle(tow)}
        </div>
        <div className="text-[12px] text-[#8e8e93] truncate mt-0.5 leading-tight">
          {tow.towed_from ?? "Unknown location"}
        </div>
        <div className="text-[11px] text-[#aeaeb2] mt-0.5">{timeAgo}</div>
      </div>
      <div
        className="flex-shrink-0 px-2 py-[3px] rounded-full text-[10px] font-semibold text-white leading-none"
        style={{ background: statusColor }}
      >
        {tow.status ?? "—"}
      </div>
    </button>
  )
}
