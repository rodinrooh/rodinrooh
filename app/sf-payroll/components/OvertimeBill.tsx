"use client"

import type { Stats } from "../lib/types"
import { usdCompact } from "../lib/format"

// Illustrative unit costs (rounded, public ballpark figures) — used only to make
// the size of the overtime bill tangible, not as a budget proposal.
const ITEMS = [
  { emoji: "🚌", unit: 1_300_000, noun: "new battery-electric Muni buses", each: "~$1.3M each" },
  { emoji: "🏠", unit: 700_000, noun: "permanently affordable homes built", each: "~$700K each" },
  { emoji: "🚒", unit: 110_000, noun: "first-year firefighter salaries", each: "~$110K each" },
  { emoji: "🎟️", unit: 2.5, noun: "one-way Muni fares", each: "$2.50 each" },
]

export default function OvertimeBill({ stats }: { stats: Stats }) {
  return (
    <section className="pay-bill">
      <div className="pay-section-head">
        <h2 className="pay-h2">What {usdCompact(stats.totalOT)} buys</h2>
        <p className="pay-section-sub">
          One year of city overtime, sized against things the same money could have paid for. Illustrative,
          not a budget — the point is the scale.
        </p>
      </div>

      <div className="pay-billgrid">
        {ITEMS.map((it) => {
          const count = Math.round(stats.totalOT / it.unit)
          return (
            <div key={it.noun} className="pay-billcard">
              <div className="pay-bill-emoji">{it.emoji}</div>
              <div className="pay-bill-count">{count.toLocaleString()}</div>
              <div className="pay-bill-noun">{it.noun}</div>
              <div className="pay-bill-each">{it.each}</div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
