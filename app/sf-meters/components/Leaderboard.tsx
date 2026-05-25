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
    .slice(0, 25)

  if (rows.length === 0) {
    return <p style={{ fontSize: 13, color: "#999", margin: 0 }}>No data yet — check back soon.</p>
  }

  return (
    <div>
      {rows.map((row, i) => (
        <div key={row.block} style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          padding: "10px 0",
          borderBottom: "1px solid #f0f0f0",
          gap: 12,
        }}>
          <span style={{ fontSize: 12, color: "#ccc", width: 20, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
          <span style={{ flex: 1, fontSize: 13, color: "#000", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {row.block}
          </span>
          <span style={{ fontSize: 12, color: "#999", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
            {row.count} sessions
          </span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#000", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
            ${row.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      ))}
    </div>
  )
}
