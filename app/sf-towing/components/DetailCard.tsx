"use client"

import { useEffect, useRef } from "react"
import { getStatusColor } from "@/lib/colorMap"
import type { Tow } from "@/lib/types"

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
    timeZone: "America/Los_Angeles",
  })
}

function formatCarTitle(tow: Tow): string {
  return [tow.color, tow.year, tow.make, tow.model]
    .filter(Boolean).map((v) => String(v)).join(" ")
}

interface DetailCardProps {
  tow: Tow
  onClose: () => void
}

export default function DetailCard({ tow, onClose }: DetailCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [onClose])

  const statusColor = getStatusColor(tow.status)

  function getDirections() {
    const addr = tow.tow_company_address ?? tow.tow_company ?? ""
    const encoded = encodeURIComponent(addr)
    const url = /iPhone|iPad|Mac/.test(navigator.userAgent)
      ? `maps://maps.apple.com/?q=${encoded}`
      : `https://maps.apple.com/?q=${encoded}`
    window.open(url, "_blank")
  }

  return (
    <div
      ref={cardRef}
      className="fixed z-50
        bottom-0 left-0 right-0 rounded-t-2xl
        md:bottom-auto md:left-auto md:right-6 md:top-1/2 md:-translate-y-1/2 md:w-[340px] md:rounded-2xl"
      style={{
        maxHeight: "85vh", overflowY: "auto",
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
        boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
      }}
    >
      <div className="px-5 pt-5 pb-4" style={{ borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[17px] font-bold text-[#1c1c1e] leading-tight">{formatCarTitle(tow)}</div>
            {tow.license && (
              <div className="text-[13px] text-[#8e8e93] mt-0.5">
                {tow.license}{tow.state ? ` · ${tow.state}` : ""}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
            <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold text-white" style={{ background: statusColor }}>
              {tow.status ?? "UNKNOWN"}
            </span>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full flex items-center justify-center text-[#8e8e93] hover:text-[#1c1c1e] transition-colors text-lg leading-none"
              style={{ background: "rgba(0,0,0,0.06)" }}
            >
              ×
            </button>
          </div>
        </div>
      </div>
      <div className="px-5 py-4">
        <div className="rounded-xl overflow-hidden" style={{ background: "rgba(0,0,0,0.04)" }}>
          <FieldRow label="Towed from" value={tow.towed_from} />
          <FieldRow label="Towed by" value={tow.towed_by} />
          <FieldRow label="Reason" value={tow.reason} />
          <FieldRow label="Date & time" value={formatDateTime(tow.towed_at)} />
          <FieldRow label="Tow company" value={tow.tow_company} />
          {tow.tow_company_address && <FieldRow label="Impound address" value={tow.tow_company_address} />}
          {tow.tr_number && <FieldRow label="TR number" value={tow.tr_number} last />}
        </div>
      </div>
      {(tow.tow_company_address || tow.tow_company) && (
        <div className="px-5 pb-5">
          <button
            onClick={getDirections}
            className="w-full py-3 rounded-xl text-white text-[14px] font-semibold transition-opacity hover:opacity-90"
            style={{ background: "#007aff" }}
          >
            Get directions to impound
          </button>
        </div>
      )}
    </div>
  )
}

function FieldRow({ label, value, last }: { label: string; value: string | null | undefined; last?: boolean }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3 px-4 py-3" style={last ? {} : { borderBottom: "1px solid rgba(0,0,0,0.07)" }}>
      <div className="text-[12px] font-medium text-[#8e8e93] w-[100px] flex-shrink-0 pt-px">{label}</div>
      <div className="text-[13px] font-medium text-[#1c1c1e] flex-1 leading-snug">{value}</div>
    </div>
  )
}
