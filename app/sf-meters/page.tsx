"use client"

export const dynamic = "force-dynamic"

import { useCallback, useEffect, useRef, useState } from "react"
import Map, { type MapHandle } from "./components/Map"
import Leaderboard from "./components/Leaderboard"
import { supabaseMeters } from "@/lib/supabase-meters"
import type { MeterTransaction } from "@/lib/types-meters"

function shiftedDate(dt: string): Date {
  const raw = new Date(dt)
  const today = new Date()
  today.setHours(raw.getUTCHours(), raw.getUTCMinutes(), raw.getUTCSeconds(), 0)
  return today
}

function formatTime(dt: string): string {
  try {
    return shiftedDate(dt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  } catch {
    return dt
  }
}

function yesterdayDateStr(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().split("T")[0]
}

async function loadPage(setTransactions: (t: MeterTransaction[]) => void, setLoading: (b: boolean) => void) {
  const dateStr = yesterdayDateStr()
  const start = `${dateStr}T00:00:00`
  const end = `${dateStr}T23:59:59`
  const pageSize = 1000

  const baseQuery = () => supabaseMeters
    .from("sf_meter_transactions")
    .select("*")
    .eq("meter_event_type", "NS")
    .not("street_block", "ilike", "%Garage%")
    .not("street_block", "ilike", "%Lot%")
    .gte("session_start_dt", start)
    .lte("session_start_dt", end)
    .order("session_start_dt", { ascending: true })

  // Get total count first, then fetch all pages in parallel
  const { count } = await supabaseMeters
    .from("sf_meter_transactions")
    .select("*", { count: "exact", head: true })
    .eq("meter_event_type", "NS")
    .not("street_block", "ilike", "%Garage%")
    .not("street_block", "ilike", "%Lot%")
    .gte("session_start_dt", start)
    .lte("session_start_dt", end)

  if (!count) { setLoading(false); return }

  const pages = await Promise.all(
    Array.from({ length: Math.ceil(count / pageSize) }, (_, i) =>
      baseQuery().range(i * pageSize, (i + 1) * pageSize - 1)
    )
  )

  const all = pages.flatMap(({ data }) => (data ?? []) as MeterTransaction[])
  setTransactions(all)
  setLoading(false)
}

type Tab = "feed" | "leaderboard"

function Feed({ transactions, targetDate }: { transactions: MeterTransaction[]; targetDate: string }) {
  const sorted = [...transactions]
    .sort((a, b) => shiftedDate(b.session_start_dt).getTime() - shiftedDate(a.session_start_dt).getTime())
    .slice(0, 500)

  if (sorted.length === 0) return <p style={{ fontSize: 13, color: "#999", margin: 0 }}>No sessions yet — check back soon.</p>

  return (
    <div>
      {sorted.map((tx) => {
        const txDate = tx.session_start_dt.split("T")[0]
        const dateLabel = txDate !== targetDate
          ? new Date(txDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
          : null
        return (
          <div key={tx.id} style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            padding: "10px 0",
            borderBottom: "1px solid #f0f0f0",
          }}>
            <div>
              <div style={{ fontSize: 13, color: "#000", fontWeight: 500, letterSpacing: "-0.02em" }}>{tx.street_block}</div>
              <div style={{ fontSize: 11, color: "#999", marginTop: 2, letterSpacing: "-0.01em" }}>
                {formatTime(tx.session_start_dt)} · {tx.payment_type?.toLowerCase()}
                {dateLabel && <span style={{ color: "#ccc" }}> · {dateLabel}</span>}
              </div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#000", fontVariantNumeric: "tabular-nums", flexShrink: 0, marginLeft: 12, letterSpacing: "-0.025em" }}>
              ${Number(tx.gross_paid_amt).toFixed(2)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

interface TooltipProps { tx: MeterTransaction; onClose: () => void }
function TransactionTooltip({ tx, onClose }: TooltipProps) {
  return (
    <div className="absolute z-30" style={{
      top: 16, right: 16,
      background: "rgba(0,0,0,0.82)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      borderRadius: 14,
      padding: "16px 20px",
      minWidth: 200,
      border: "1px solid rgba(255,255,255,0.12)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", lineHeight: 1.3, maxWidth: 150, letterSpacing: "-0.025em" }}>{tx.street_block}</div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 0 0 8px" }}>×</button>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#FFA726", fontVariantNumeric: "tabular-nums", marginBottom: 8, letterSpacing: "-0.03em" }}>
        ${Number(tx.gross_paid_amt).toFixed(2)}
      </div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{formatTime(tx.session_start_dt)}</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", textTransform: "capitalize" }}>{tx.payment_type?.toLowerCase()}</div>
    </div>
  )
}

export default function SFMetersPage() {
  const [transactions, setTransactions] = useState<MeterTransaction[]>([])
  const [now, setNow] = useState(() => new Date())
  const [selected, setSelected] = useState<MeterTransaction | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>("feed")
  const mapRef = useRef<MapHandle>(null)

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    loadPage(setTransactions, setLoading)
    const interval = setInterval(() => loadPage(setTransactions, setLoading), 60000)
    return () => clearInterval(interval)
  }, [])

  const visibleTransactions = transactions.filter((tx) => shiftedDate(tx.session_start_dt) <= now)
  const mappableTransactions = visibleTransactions.filter((tx) => tx.lat && tx.lng && tx.geocoded)
  const totalRevenue = visibleTransactions.reduce((sum, tx) => sum + Number(tx.gross_paid_amt), 0)

  const handleSelect = useCallback((tx: MeterTransaction) => {
    setSelected(tx)
    if (tx.lat && tx.lng) mapRef.current?.flyTo(tx.lat, tx.lng)
  }, [])

  const P = 27

  return (
    <div style={{
      display: "flex",
      height: "100svh",
      background: "#fff",
      padding: P,
      gap: P,
      boxSizing: "border-box",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
      overflow: "hidden",
    }}>
      {/* Left column */}
      <div style={{ flex: "0 0 36%", display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* Headline */}
        <h1 style={{
          fontSize: "clamp(20px, 2vw, 32px)",
          fontWeight: 800,
          lineHeight: 1.12,
          color: "#000",
          margin: "0 0 32px 0",
          letterSpacing: "-0.04em",
        }}>
          San Francisco has collected {loading ? "…" : `$${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}<br />
          from parking meters today.
        </h1>

        {/* Switcher */}
        <div style={{ display: "flex", gap: 20, marginBottom: 16, borderBottom: "1px solid #eee", paddingBottom: 12, alignItems: "center" }}>
          {(["feed", "leaderboard"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: tab === t ? 700 : 400,
              color: tab === t ? "#000" : "#999",
              padding: 0,
              letterSpacing: tab === t ? "-0.025em" : "-0.01em",
            }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
          {loading && <span style={{ fontSize: 12, color: "#bbb", marginLeft: "auto", letterSpacing: "-0.01em" }}>Loading…</span>}
          {!loading && (
            <span style={{ fontSize: 12, color: "#bbb", marginLeft: "auto", letterSpacing: "-0.01em" }}>
              {visibleTransactions.length.toLocaleString()} sessions
            </span>
          )}
        </div>

        {/* Scrollable list area */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {tab === "feed"
            ? <Feed transactions={visibleTransactions} targetDate={yesterdayDateStr()} />
            : <Leaderboard transactions={visibleTransactions} />
          }
        </div>
      </div>

      {/* Right column — map */}
      <div style={{
        flex: 1,
        borderRadius: 23,
        overflow: "hidden",
        position: "relative",
        background: "#d4d4d4",
        minWidth: 0,
      }}>
        <Map ref={mapRef} transactions={mappableTransactions} onSelectTransaction={handleSelect} />

        {/* Legend */}
        <div style={{
          position: "absolute",
          bottom: 16,
          left: 16,
          background: "rgba(255,255,255,0.88)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderRadius: 10,
          padding: "8px 12px",
          border: "1px solid rgba(0,0,0,0.06)",
        }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(0,0,0,0.4)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>Session cost</div>
          {[
            { color: "#FFF9C4", label: "< $1" },
            { color: "#FFCC80", label: "$1–$2" },
            { color: "#FFA726", label: "$2–$3" },
            { color: "#EF6C00", label: "$3–$5" },
            { color: "#BF360C", label: "$5+" },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: color, flexShrink: 0, border: "1px solid rgba(0,0,0,0.15)" }} />
              <span style={{ fontSize: 11, color: "rgba(0,0,0,0.55)" }}>{label}</span>
            </div>
          ))}
        </div>

        {selected && <TransactionTooltip tx={selected} onClose={() => setSelected(null)} />}
      </div>
    </div>
  )
}
