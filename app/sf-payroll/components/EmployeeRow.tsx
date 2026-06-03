"use client"

import type { Employee, LeaderCard, Stats } from "../lib/types"
import { usd, pct, hoursLabel, benchmarkTags } from "../lib/format"

export default function EmployeeRow({
  e,
  stats,
  rank,
}: {
  e: Employee | LeaderCard
  stats: Stats
  rank?: number
}) {
  // Quiet meta line: plain facts first, then only the notable flags (OT > salary,
  // out-earned the Governor). The 4,000-hours flag is implicit in the hours fact.
  const flags = benchmarkTags(e, stats).filter((t) => t.tone !== "hours")

  return (
    <div className="pay-row">
      <div className="pay-row-head">
        <div className="pay-row-id">
          {rank != null && <span className="pay-rank">{rank}</span>}
          <div className="pay-row-idtext">
            <div className="pay-row-name">{e.name || "(no name on record)"}</div>
            <div className="pay-row-sub">
              {e.job}
              {e.department ? ` · ${e.department}` : ""}
            </div>
          </div>
        </div>
        <div className="pay-row-nums">
          <div className="pay-num">
            <div className="pay-num-val is-ot">{usd(e.ot)}</div>
            <div className="pay-num-label">overtime</div>
          </div>
          <div className="pay-num">
            <div className="pay-num-val">{usd(e.totalComp)}</div>
            <div className="pay-num-label">total comp</div>
          </div>
        </div>
      </div>

      <div className="pay-meta">
        <span className="pay-meta-fact">base {usd(e.base)}</span>
        <span className="pay-meta-fact">{hoursLabel(e.hours)} paid hrs</span>
        {e.otPct != null && <span className="pay-meta-fact">{pct(e.otPct)} of base in OT</span>}
        {flags.map((t, i) => (
          <span key={i} className={`pay-meta-item is-${t.tone}`}>
            {t.label}
          </span>
        ))}
      </div>
    </div>
  )
}
