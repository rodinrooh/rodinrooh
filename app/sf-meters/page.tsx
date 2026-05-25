"use client"

export const dynamic = "force-dynamic"

import { useCallback, useEffect, useRef, useState } from "react"
import Map, { type MapHandle } from "./components/Map"
import Leaderboard from "./components/Leaderboard"
import { supabaseMeters, getSupabaseMeters } from "@/lib/supabase-meters"
import type { MeterTransaction } from "@/lib/types-meters"

function getTodayMidnightPT(): string {
  // Get current date in Pacific time, floor to midnight, return as ISO string
  const now = new Date()
  const ptFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  const parts = ptFormatter.formatToParts(now)
  const year = parts.find((p) => p.type === "year")!.value
  const month = parts.find((p) => p.type === "month")!.value
  const day = parts.find((p) => p.type === "day")!.value
  // Midnight PT as ISO string (with timezone offset, converted to UTC)
  const midnightPT = new Date(`${year}-${month}-${day}T00:00:00-08:00`)
  return midnightPT.toISOString()
}

function formatTime(dt: string): string {
  try {
    return new Date(dt).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/Los_Angeles",
    })
  } catch {
    return dt
  }
}

interface TooltipProps {
  tx: MeterTransaction
  onClose: () => void
}

function TransactionTooltip({ tx, onClose }: TooltipProps) {
  return (
    <div
      className="absolute z-30"
      style={{
        top: 16,
        right: 16,
        background: "rgba(0,0,0,0.82)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderRadius: 14,
        padding: "16px 20px",
        minWidth: 220,
        border: "1px solid rgba(255,255,255,0.12)",
        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", lineHeight: 1.3, maxWidth: 170 }}>
          {tx.street_block}
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "rgba(255,255,255,0.4)",
            cursor: "pointer",
            fontSize: 18,
            lineHeight: 1,
            padding: "0 0 0 8px",
          }}
        >
          ×
        </button>
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: "#FFA726", fontVariantNumeric: "tabular-nums", marginBottom: 8 }}>
        ${Number(tx.gross_paid_amt).toFixed(2)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
          {formatTime(tx.session_start_dt)}
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", textTransform: "capitalize" }}>
          {tx.payment_type?.toLowerCase()}
        </div>
      </div>
    </div>
  )
}

export default function SFMetersPage() {
  const [transactions, setTransactions] = useState<MeterTransaction[]>([])
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [selected, setSelected] = useState<MeterTransaction | null>(null)
  const [loading, setLoading] = useState(true)
  const mapRef = useRef<MapHandle>(null)

  useEffect(() => {
    const todayMidnight = getTodayMidnightPT()

    async function loadInitial() {
      const { data, error } = await supabaseMeters
        .from("sf_meter_transactions")
        .select("*")
        .gte("session_start_dt", todayMidnight)
        .eq("meter_event_type", "NS")
        .eq("geocoded", true)
        .not("street_block", "ilike", "%Garage%")
        .not("street_block", "ilike", "%Lot%")
        .not("lat", "is", null)
        .order("session_start_dt", { ascending: true })

      if (!error && data) {
        setTransactions(data as MeterTransaction[])
        setTotalRevenue(
          (data as MeterTransaction[]).reduce((sum, tx) => sum + Number(tx.gross_paid_amt), 0)
        )
      }
      setLoading(false)
    }

    loadInitial()

    // Realtime subscription
    const client = getSupabaseMeters()
    const channel = client
      .channel("sf_meter_transactions_insert")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sf_meter_transactions" },
        (payload) => {
          const tx = payload.new as MeterTransaction
          if (tx.meter_event_type !== "NS") return
          if (!tx.street_block || tx.street_block.includes("Garage") || tx.street_block.includes("Lot")) return
          if (!tx.lat || !tx.lng || !tx.geocoded) return
          const txDate = new Date(tx.session_start_dt)
          if (txDate < new Date(todayMidnight)) return
          setTransactions((prev) => [...prev, tx])
          setTotalRevenue((prev) => prev + Number(tx.gross_paid_amt))
        }
      )
      .subscribe()

    return () => {
      client.removeChannel(channel)
    }
  }, [])

  const handleSelect = useCallback((tx: MeterTransaction) => {
    setSelected(tx)
    if (tx.lat && tx.lng) {
      mapRef.current?.flyTo(tx.lat, tx.lng)
    }
  }, [])

  return (
    <div style={{ display: "flex", flexDirection: "column", background: "#0a0a0a" }}>
      {/* Map section */}
      <div className="relative" style={{ height: "100svh", minHeight: 500 }}>
        <Map ref={mapRef} transactions={transactions} onSelectTransaction={handleSelect} />

        {/* Revenue counter overlay */}
        <div
          className="absolute z-20"
          style={{
            top: 20,
            left: 20,
            background: "rgba(0,0,0,0.62)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            borderRadius: 18,
            padding: "18px 26px 16px",
            border: "1px solid rgba(255,255,255,0.1)",
            fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
            maxWidth: "calc(100vw - 40px)",
          }}
        >
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.14em",
            color: "rgba(255,255,255,0.45)",
            textTransform: "uppercase",
            marginBottom: 4,
          }}>
            SF Has Collected
          </div>
          <div style={{
            fontSize: "clamp(36px, 8vw, 58px)",
            fontWeight: 700,
            color: "#fff",
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
            marginBottom: 6,
          }}>
            ${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
            {loading ? "Loading…" : `${transactions.length.toLocaleString()} meter sessions today`}
          </div>
        </div>

        {/* Dot color legend */}
        <div
          className="absolute z-20"
          style={{
            bottom: 20,
            left: 20,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            borderRadius: 12,
            padding: "10px 14px",
            border: "1px solid rgba(255,255,255,0.08)",
            fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.35)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 7 }}>
            Session cost
          </div>
          {[
            { color: "#FFF9C4", label: "< $1" },
            { color: "#FFCC80", label: "$1–$2" },
            { color: "#FFA726", label: "$2–$3" },
            { color: "#EF6C00", label: "$3–$5" },
            { color: "#BF360C", label: "$5+" },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0, border: "1px solid rgba(0,0,0,0.2)" }} />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Scroll hint */}
        <div
          className="absolute z-20"
          style={{
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: 11,
            color: "rgba(255,255,255,0.3)",
            fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
            display: "flex",
            alignItems: "center",
            gap: 6,
            pointerEvents: "none",
          }}
        >
          Scroll for leaderboard ↓
        </div>

        {/* Transaction tooltip */}
        {selected && <TransactionTooltip tx={selected} onClose={() => setSelected(null)} />}
      </div>

      {/* Leaderboard */}
      <Leaderboard transactions={transactions} />
    </div>
  )
}
