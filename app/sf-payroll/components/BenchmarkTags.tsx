"use client"

import type { Employee, LeaderCard, Stats } from "../lib/types"
import { benchmarkTags } from "../lib/format"

export default function BenchmarkTags({ e, stats }: { e: Employee | LeaderCard; stats: Stats }) {
  const tags = benchmarkTags(e, stats)
  if (tags.length === 0) return null
  return (
    <div className="pay-tags">
      {tags.map((t, i) => (
        <span key={i} className={`pay-tag is-${t.tone}`}>
          {t.label}
        </span>
      ))}
    </div>
  )
}
