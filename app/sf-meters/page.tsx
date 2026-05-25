"use client"

export const dynamic = "force-dynamic"

import { useCallback, useEffect, useRef, useState } from "react"
import Map, { type MapHandle } from "./components/Map"
import Leaderboard from "./components/Leaderboard"
import { supabaseMeters } from "@/lib/supabase-meters"
import type { MeterTransaction } from "@/lib/types-meters"

function shiftedDate(dt: string): Date {
  // DataSF stores times in PT without timezone — Postgres tagged them UTC.
  // Extract the UTC hour/min/sec (which == the original PT hour/min/sec)
  // and apply them to today, so historical data looks like today's live feed.
  const raw = new Date(dt)
  const today = new Date()
  today.setHours(raw.getUTCHours(), raw.getUTCMinutes(), raw.getUTCSeconds(), 0)
  return today
}

function formatTime(dt: string): string {
  try {
    return shiftedDate(dt).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
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
        <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 0 0 8px" }}>
          ×
        </button>
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: "#FFA726", fontVariantNumeric: "tabular-nums", marginBottom: 8 }}>
        ${Number(tx.gross_paid_amt).toFixed(2)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{formatTime(tx.session_start_dt)}</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", textTransform: "capitalize" }}>{tx.payment_type?.toLowerCase()}</div>
      </div>
    </div>
  )
}

function TransactionList({ transactions }: { transactions: MeterTransaction[] }) {
  const sorted = [...transactions].sort(
    (a, b) => shiftedDate(b.session_start_dt).getTime() - shiftedDate(a.session_start_dt).getTime()
  )
  return (
    <div style={{ background: "#0a0a0a", padding: "40px 24px 80px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 20, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
          All Transactions ({sorted.length.toLocaleString()})
        </h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              {["Time", "Street Block", "Amount", "Payment"].map((h) => (
                <th key={h} style={{ textAlign: h === "Amount" ? "right" : "left", padding: "8px 12px", fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.3)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((tx) => (
              <tr key={tx.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <td style={{ padding: "10px 12px", fontSize: 13, color: "rgba(255,255,255,0.45)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                  {formatTime(tx.session_start_dt)}
                </td>
                <td style={{ padding: "10px 12px", fontSize: 13, color: "rgba(255,255,255,0.8)" }}>
                  {tx.street_block}
                </td>
                <td style={{ padding: "10px 12px", fontSize: 13, color: "#FFA726", fontWeight: 600, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                  ${Number(tx.gross_paid_amt).toFixed(2)}
                </td>
                <td style={{ padding: "10px 12px", fontSize: 12, color: "rgba(255,255,255,0.35)", textTransform: "capitalize" }}>
                  {tx.payment_type?.toLowerCase()}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: "40px 12px", textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.2)" }}>
                  No transactions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

async function loadPage(setTransactions: (t: MeterTransaction[]) => void, setLoading: (b: boolean) => void) {
  // Load all transactions — shiftedDate maps each one's time-of-day to today
  let all: MeterTransaction[] = []
  let from = 0
  const pageSize = 1000

  while (true) {
    const { data, error } = await supabaseMeters
      .from("sf_meter_transactions")
      .select("*")
      .eq("meter_event_type", "NS")
      .not("street_block", "ilike", "%Garage%")
      .not("street_block", "ilike", "%Lot%")
      .order("session_start_dt", { ascending: true })
      .range(from, from + pageSize - 1)

    if (error || !data) break
    all = all.concat(data as MeterTransaction[])
    if (data.length < pageSize) break
    from += pageSize
  }

  setTransactions(all)
  setLoading(false)
}

export default function SFMetersPage() {
  const [transactions, setTransactions] = useState<MeterTransaction[]>([])
  const [now, setNow] = useState(() => new Date())
  const [selected, setSelected] = useState<MeterTransaction | null>(null)
  const [loading, setLoading] = useState(true)
  const mapRef = useRef<MapHandle>(null)

  // Tick every 30s so newly-unblocked transactions appear automatically
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(interval)
  }, [])

  // All transactions where shifted time <= now (for counter, list, leaderboard)
  const visibleTransactions = transactions.filter(
    (tx) => shiftedDate(tx.session_start_dt) <= now
  )
  // Only geocoded ones go on the map
  const mappableTransactions = visibleTransactions.filter(
    (tx) => tx.lat && tx.lng && tx.geocoded
  )
  const totalRevenue = visibleTransactions.reduce(
    (sum, tx) => sum + Number(tx.gross_paid_amt), 0
  )

  useEffect(() => {
    loadPage(setTransactions, setLoading)
    // Refetch every 60s — picks up new transactions AND newly geocoded dots
    const interval = setInterval(() => loadPage(setTransactions, setLoading), 60000)
    return () => clearInterval(interval)
  }, [])

  const handleSelect = useCallback((tx: MeterTransaction) => {
    setSelected(tx)
    if (tx.lat && tx.lng) mapRef.current?.flyTo(tx.lat, tx.lng)
  }, [])

  return (
    <div style={{ display: "flex", flexDirection: "column", background: "#0a0a0a" }}>
      <div className="relative" style={{ height: "100svh", minHeight: 500 }}>
        <Map ref={mapRef} transactions={mappableTransactions} onSelectTransaction={handleSelect} />

        {/* Revenue counter */}
        <div className="absolute z-20" style={{ top: 20, left: 20, background: "rgba(0,0,0,0.62)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", borderRadius: 18, padding: "18px 26px 16px", border: "1px solid rgba(255,255,255,0.1)", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif", maxWidth: "calc(100vw - 40px)" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: "rgba(255,255,255,0.45)", textTransform: "uppercase", marginBottom: 4 }}>
            SF Has Collected
          </div>
          <div style={{ fontSize: "clamp(36px, 8vw, 58px)", fontWeight: 700, color: "#fff", fontVariantNumeric: "tabular-nums", lineHeight: 1, marginBottom: 6 }}>
            ${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
            {loading ? "Loading…" : `${visibleTransactions.length.toLocaleString()} meter sessions today`}
          </div>
        </div>

        {/* Legend */}
        <div className="absolute z-20" style={{ bottom: 20, left: 20, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderRadius: 12, padding: "10px 14px", border: "1px solid rgba(255,255,255,0.08)", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.35)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 7 }}>Session cost</div>
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

        <div className="absolute z-20" style={{ bottom: 20, left: "50%", transform: "translateX(-50%)", fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif", pointerEvents: "none" }}>
          Scroll for data ↓
        </div>

        {selected && <TransactionTooltip tx={selected} onClose={() => setSelected(null)} />}
      </div>

      <TransactionList transactions={visibleTransactions} />
      <Leaderboard transactions={visibleTransactions} />
    </div>
  )
}
