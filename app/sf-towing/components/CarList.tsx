"use client"

import type { Tow } from "@/lib/types"
import CarRow from "./CarRow"

interface CarListProps {
  tows: Tow[]
  selectedId: number | null
  onSelect: (tow: Tow) => void
}

export default function CarList({ tows, selectedId, onSelect }: CarListProps) {
  if (tows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-[#8e8e93] text-sm">
        <div className="text-3xl mb-2">🚗</div>
        <div>No tows yet today</div>
      </div>
    )
  }

  return (
    <div className="overflow-y-auto flex-1">
      <p style={{
        margin: "4px 16px 12px",
        padding: "10px 14px",
        borderRadius: "10px",
        background: "#fff5e0",
        border: "1px solid #f0b429",
        fontSize: "13px",
        fontWeight: 600,
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        lineHeight: "1.5",
        color: "#92400e",
      }}>
        This site only worked for 4 hours until Autura added a firewall to the data source I was using. This data is a snapshot of how it looked on May 12, 2026 at 1:43 PM.
      </p>
      {tows.map((tow) => (
        <CarRow
          key={tow.vehicle_id}
          tow={tow}
          selected={tow.vehicle_id === selectedId}
          onClick={() => onSelect(tow)}
        />
      ))}
    </div>
  )
}
