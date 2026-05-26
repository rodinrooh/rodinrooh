"use client"

import type { MeterTransaction } from "@/lib/types-meters"

interface LeaderboardProps {
  transactions: MeterTransaction[]
  onSelect?: (tx: MeterTransaction) => void
}

export default function Leaderboard({ transactions, onSelect }: LeaderboardProps) {
  const grouped = new globalThis.Map<string, { count: number; total: number }>()
  for (const tx of transactions) {
    const existing = grouped.get(tx.street_block)
    if (existing) {
      existing.count++
      existing.total += Number(tx.gross_paid_amt)
    } else {
      grouped.set(tx.street_block, { count: 1, total: Number(tx.gross_paid_amt) })
    }
  }

  const rows = [...grouped.entries()]
    .map(([block, stats]) => ({ block, ...stats }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 20)

  if (rows.length === 0) {
    return <p style={{ fontSize: 13, color: "#999", margin: 0 }}>No data yet — check back soon.</p>
  }

  return (
    <div>
      {rows.map((row, i) => {
        const representative = transactions.find(tx => tx.street_block === row.block && tx.lat && tx.lng)
        return (
        <div key={row.block} onClick={() => representative && onSelect?.(representative)} style={{
          display: "flex",
          alignItems: "center",
          padding: "14px 0",
          borderBottom: "1px solid #f0f0f0",
          gap: 16,
          cursor: representative && onSelect ? "pointer" : "default",
        }}>
          <span style={{ fontSize: 11, color: "#ccc", width: 18, flexShrink: 0, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>{i + 1}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#000", letterSpacing: "-0.03em", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textTransform: "lowercase" }}>
              {row.block}
            </div>
            <div style={{ fontSize: 11, color: "#aaa", marginTop: 3, letterSpacing: "-0.01em" }}>
              {row.count} sessions
            </div>
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#000", fontVariantNumeric: "tabular-nums", flexShrink: 0, letterSpacing: "-0.03em" }}>
            ${row.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        )
      })}
    </div>
  )
}
