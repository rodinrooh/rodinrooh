"use client"

import type { MeterTransaction } from "@/lib/types-meters"

interface LeaderboardProps {
  transactions: MeterTransaction[]
}

export default function Leaderboard({ transactions }: LeaderboardProps) {
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
      {rows.map((row, i) => (
        <div key={row.block} style={{
          display: "flex",
          alignItems: "flex-start",
          padding: "13px 0",
          borderBottom: "1px solid #f0f0f0",
          gap: 11,
        }}>
          <span style={{ fontSize: 11, color: "#ccc", width: 18, flexShrink: 0, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em", paddingTop: 3 }}>{i + 1}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#000", letterSpacing: "-0.03em", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {row.block}
            </div>
            <div style={{ fontSize: 11, color: "#aaa", marginTop: 3, letterSpacing: "-0.01em" }}>
              {row.count} sessions
            </div>
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#000", fontVariantNumeric: "tabular-nums", flexShrink: 0, letterSpacing: "-0.03em", paddingTop: 1 }}>
            ${row.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      ))}
    </div>
  )
}
