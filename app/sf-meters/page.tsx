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

function dotColor(amount: number): string {
  if (amount < 3) return "#FFF9C4"
  if (amount < 8) return "#FFCC80"
  if (amount < 14) return "#FFA726"
  if (amount < 24) return "#EF6C00"
  return "#BF360C"
}

function formatTime(dt: string): string {
  try {
    return shiftedDate(dt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  } catch {
    return dt
  }
}

function yesterdayDateStr(): string {
  const ptToday = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })
  const d = new Date(ptToday + "T12:00:00")
  d.setDate(d.getDate() - 1)
  return d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })
}

type LeaderboardPeriod = "24h" | "7d" | "30d" | "all"

async function loadHistorical(period: "7d" | "30d" | "all") {
  const ptToday = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })
  let query = supabaseMeters
    .from("sf_meter_transactions")
    .select("street_block, gross_paid_amt")
    .eq("meter_event_type", "NS")
    .not("street_block", "ilike", "%Garage%")
    .not("street_block", "ilike", "%Lot%")
  if (period !== "all") {
    const days = period === "7d" ? 7 : 30
    const d = new Date(ptToday + "T12:00:00")
    d.setDate(d.getDate() - days)
    const start = d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })
    query = query.gte("session_start_dt", `${start}T00:00:00`)
  }
  const { data } = await query.limit(100000)
  return (data ?? []) as unknown as MeterTransaction[]
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

function StatBox({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: "#aaa", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: "#000", letterSpacing: "-0.03em", lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 11, color: "#aaa", letterSpacing: "-0.01em", marginTop: 2 }}>{sub}</div>
    </div>
  )
}

type Tab = "feed" | "leaderboard"

function Feed({ transactions, targetDate, onSelect }: { transactions: MeterTransaction[]; targetDate: string; onSelect?: (tx: MeterTransaction) => void }) {
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
          <div key={tx.id} onClick={() => onSelect?.(tx)} style={{
            display: "flex",
            alignItems: "center",
            padding: "19px 0",
            borderBottom: "1px solid #f0f0f0",
            gap: 16,
            cursor: onSelect ? "pointer" : "default",
          }}>
            <div style={{
              width: 18, height: 18,
              borderRadius: "50%",
              background: dotColor(Number(tx.gross_paid_amt)),
              flexShrink: 0,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#000", letterSpacing: "-0.03em", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textTransform: "lowercase" }}>
                {tx.street_block}
              </div>
              <div style={{ fontSize: 12, color: "#aaa", marginTop: 4, letterSpacing: "-0.01em" }}>
                {formatTime(tx.session_start_dt)} · {tx.payment_type?.toLowerCase()}
                {dateLabel && <span style={{ color: "#ccc" }}> · {dateLabel}</span>}
              </div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#000", fontVariantNumeric: "tabular-nums", flexShrink: 0, letterSpacing: "-0.03em" }}>
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

function PeriodPills({ period, onChange }: { period: LeaderboardPeriod; onChange: (p: LeaderboardPeriod) => void }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 14, marginTop: 2 }}>
      {(["24h", "7d", "30d", "all"] as LeaderboardPeriod[]).map((p) => (
        <button key={p} onClick={() => onChange(p)} style={{
          fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20,
          border: "none", cursor: "pointer", letterSpacing: "-0.01em",
          background: period === p ? "#000" : "#efefef",
          color: period === p ? "#fff" : "#999",
        }}>
          {p === "all" ? "All time" : p}
        </button>
      ))}
    </div>
  )
}

export default function SFMetersPage() {
  const [transactions, setTransactions] = useState<MeterTransaction[]>([])
  const [now, setNow] = useState(() => new Date())
  const [selected, setSelected] = useState<MeterTransaction | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>("feed")
  const [isMobile, setIsMobile] = useState(false)
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<LeaderboardPeriod>("24h")
  const [historicalTxs, setHistoricalTxs] = useState<Partial<Record<LeaderboardPeriod, MeterTransaction[]>>>({})
  const [historicalLoading, setHistoricalLoading] = useState(false)
  const mapRef = useRef<MapHandle>(null)
  const headlineRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    loadPage(setTransactions, setLoading)
    const interval = setInterval(() => loadPage(setTransactions, setLoading), 60000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (leaderboardPeriod === "24h") return
    if (historicalTxs[leaderboardPeriod]) return
    setHistoricalLoading(true)
    loadHistorical(leaderboardPeriod as "7d" | "30d" | "all").then((data) => {
      setHistoricalTxs((prev) => ({ ...prev, [leaderboardPeriod]: data }))
      setHistoricalLoading(false)
    })
  }, [leaderboardPeriod])



  const visibleTransactions = transactions.filter((tx) => shiftedDate(tx.session_start_dt) <= now)
  const mappableTransactions = visibleTransactions.filter((tx) => tx.lat && tx.lng && tx.geocoded)
  const totalRevenue = visibleTransactions.reduce((sum, tx) => sum + Number(tx.gross_paid_amt), 0)

  const avgPerSession = visibleTransactions.length > 0 ? totalRevenue / visibleTransactions.length : 0
  const biggestPayment = visibleTransactions.length > 0
    ? Math.max(...visibleTransactions.map((tx) => Number(tx.gross_paid_amt)))
    : 0
  const handleSelect = useCallback((tx: MeterTransaction) => {
    setSelected(tx)
    if (tx.lat && tx.lng) mapRef.current?.flyTo(tx.lat, tx.lng)
  }, [])

  const handleSelectBlock = useCallback((block: string) => {
    const tx = transactions.find((t) => t.street_block === block && t.lat && t.lng)
    if (tx) handleSelect(tx)
  }, [transactions, handleSelect])

  useEffect(() => {
    const el = headlineRef.current
    if (!el) return
    const fit = () => {
      let lo = 14, hi = 80
      while (hi - lo > 0.4) {
        const mid = (lo + hi) / 2
        el.style.fontSize = mid + "px"
        const range = document.createRange()
        range.selectNodeContents(el)
        const tops = new Set([...range.getClientRects()].map(r => Math.round(r.top)))
        if (tops.size <= 2) lo = mid; else hi = mid
      }
      el.style.fontSize = Math.floor(lo) + "px"
    }
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    fit()
    return () => ro.disconnect()
  }, [totalRevenue, loading])

  const P = 40

  const tabBar = (
    <div style={{ display: "flex", gap: 20, padding: "12px 0", borderBottom: "1px solid #eee", alignItems: "center", flexShrink: 0 }}>
      {(["feed", "leaderboard"] as Tab[]).map((t) => (
        <button key={t} onClick={() => setTab(t)} style={{
          background: "none", border: "none", cursor: "pointer",
          fontSize: 13, fontWeight: tab === t ? 700 : 400,
          color: tab === t ? "#000" : "#999", padding: 0,
          letterSpacing: tab === t ? "-0.025em" : "-0.01em",
        }}>
          {t.charAt(0).toUpperCase() + t.slice(1)}
        </button>
      ))}
      <span style={{ fontSize: 12, color: "#bbb", marginLeft: "auto", letterSpacing: "-0.01em" }}>
        {loading ? "Loading…" : `${visibleTransactions.length.toLocaleString()} sessions`}
      </span>
    </div>
  )

  if (isMobile) {
    return (
      <div style={{ background: "#faf9f7", minHeight: "100svh" }}>
        {/* Title */}
        <div style={{ padding: "22px 20px 16px" }}>
          <h1 style={{ fontSize: 27, fontWeight: 800, lineHeight: 1.12, color: "#000", margin: 0, letterSpacing: "-0.04em" }}>
            SF has collected <span style={{ color: "#16a34a" }}>{loading ? "…" : `$${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span><br />
            from parking meters today.
          </h1>
        </div>

        {/* Map */}
        <div style={{ margin: "0 20px", borderRadius: 13, overflow: "hidden", position: "relative", height: "60svh", background: "#d4d4d4" }}>
          <Map ref={mapRef} transactions={mappableTransactions} onSelectTransaction={handleSelect} />
          {selected && <TransactionTooltip tx={selected} onClose={() => setSelected(null)} />}
        </div>

        {/* Tabs */}
        <div style={{ padding: "0 20px", marginTop: 20 }}>{tabBar}</div>

        {/* List */}
        <div style={{ padding: "0 20px 40px" }}>
          {tab === "feed"
            ? <Feed transactions={visibleTransactions} targetDate={yesterdayDateStr()} onSelect={handleSelect} />
            : <>
                <PeriodPills period={leaderboardPeriod} onChange={setLeaderboardPeriod} />
                <Leaderboard
                  transactions={leaderboardPeriod === "24h" ? visibleTransactions : (historicalTxs[leaderboardPeriod] ?? [])}
                  onSelectBlock={handleSelectBlock}
                />
                {historicalLoading && <p style={{ fontSize: 12, color: "#bbb", margin: "12px 0 0" }}>Loading…</p>}
              </>
          }
        </div>
      </div>
    )
  }

  return (
    <div style={{
      display: "flex",
      height: "100svh",
      background: "#faf9f7",
      padding: P,
      gap: P,
      boxSizing: "border-box",
      overflow: "hidden",
    }}>
      {/* Left column */}
      <div style={{ flex: "0 0 39%", display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0, padding: "28px 0" }}>
        {/* Headline */}
        <h1 ref={headlineRef} style={{
          fontWeight: 800,
          lineHeight: 1.12,
          color: "#000",
          margin: "0 0 32px 0",
          letterSpacing: "-0.04em",
        }}>
          SF has collected <span style={{ color: "#16a34a" }}>{loading ? "…" : `$${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span><br />
          from parking meters today.
        </h1>

        {/* Switcher */}
        <div style={{ marginBottom: 16 }}>{tabBar}</div>

        {/* Scrollable list area */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {tab === "feed" ? (
            <Feed transactions={visibleTransactions} targetDate={yesterdayDateStr()} onSelect={handleSelect} />
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <StatBox label="Today" value={`$${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} sub={`${visibleTransactions.length.toLocaleString()} sessions`} />
                  <StatBox label="Last 7 days" value={`$${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} sub={`${visibleTransactions.length.toLocaleString()} sessions`} />
                  <StatBox label="Last 30 days" value={`$${totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} sub={`${visibleTransactions.length.toLocaleString()} sessions`} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <StatBox label="Avg per session" value={`$${avgPerSession.toFixed(2)}`} sub="today" />
                  <StatBox label="Biggest payment" value={`$${biggestPayment.toFixed(2)}`} sub="today" />
                </div>
              </div>
              <PeriodPills period={leaderboardPeriod} onChange={setLeaderboardPeriod} />
              <Leaderboard
                transactions={leaderboardPeriod === "24h" ? visibleTransactions : (historicalTxs[leaderboardPeriod] ?? [])}
                onSelectBlock={handleSelectBlock}
              />
              {historicalLoading && <p style={{ fontSize: 12, color: "#bbb", margin: "12px 0 0" }}>Loading…</p>}
            </>
          )}
        </div>
      </div>

      {/* Right column — map */}
      <div style={{
        flex: 1,
        borderRadius: 15,
        overflow: "hidden",
        position: "relative",
        background: "#d4d4d4",
        minWidth: 0,
        margin: "28px 0",
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
            { color: "#FFF9C4", label: "< $3" },
            { color: "#FFCC80", label: "$3–$8" },
            { color: "#FFA726", label: "$8–$14" },
            { color: "#EF6C00", label: "$14–$24" },
            { color: "#BF360C", label: "$24+" },
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
