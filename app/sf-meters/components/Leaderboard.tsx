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

  return (
    <div style={{ background: "#0a0a0a", padding: "40px 24px 80px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h2 style={{
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.4)",
          marginBottom: 20,
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        }}>
          Top Blocks Today
        </h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              {["#", "Street Block", "Sessions", "Total Collected"].map((h) => (
                <th key={h} style={{
                  textAlign: h === "#" || h === "Sessions" || h === "Total Collected" ? "right" : "left",
                  padding: "8px 12px",
                  fontSize: 11,
                  fontWeight: 500,
                  color: "rgba(255,255,255,0.3)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.block} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <td style={{ padding: "12px 12px", textAlign: "right", fontSize: 13, color: "rgba(255,255,255,0.25)", width: 36 }}>
                  {i + 1}
                </td>
                <td style={{ padding: "12px 12px", fontSize: 14, color: "rgba(255,255,255,0.85)", fontWeight: 400 }}>
                  {row.block}
                </td>
                <td style={{ padding: "12px 12px", textAlign: "right", fontSize: 14, color: "rgba(255,255,255,0.55)", fontVariantNumeric: "tabular-nums" }}>
                  {row.count.toLocaleString()}
                </td>
                <td style={{ padding: "12px 12px", textAlign: "right", fontSize: 14, color: "#FFA726", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  ${row.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: "40px 12px", textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.2)" }}>
                  No data yet — check back soon.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
