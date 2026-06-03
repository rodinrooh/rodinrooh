"use client"

import type { Employee, LeaderCard, Stats } from "../lib/types"
import { usd, pct, hoursLabel } from "../lib/format"
import BenchmarkTags from "./BenchmarkTags"

function NumCell({ label, value, accent }: { label: string; value: string; accent?: "ot" | "comp" }) {
  return (
    <div className="pay-num">
      <div className={`pay-num-val${accent ? ` is-${accent}` : ""}`}>{value}</div>
      <div className="pay-num-label">{label}</div>
    </div>
  )
}

export default function EmployeeRow({
  e,
  stats,
  rank,
}: {
  e: Employee | LeaderCard
  stats: Stats
  rank?: number
}) {
  return (
    <div className="pay-row">
      <div className="pay-row-head">
        <div className="pay-row-id">
          {rank != null && <span className="pay-rank">{rank}</span>}
          <div>
            <div className="pay-row-name">{e.name || "(no name on record)"}</div>
            <div className="pay-row-sub">
              {e.job}
              {e.department ? ` · ${e.department}` : ""}
            </div>
          </div>
        </div>
        <div className="pay-row-nums">
          <NumCell label="Base salary" value={usd(e.base)} />
          <NumCell label="Overtime" value={usd(e.ot)} accent="ot" />
          <NumCell label="Total comp" value={usd(e.totalComp)} accent="comp" />
          <NumCell label="Paid hours" value={hoursLabel(e.hours)} />
          <NumCell label="OT % of base" value={pct(e.otPct)} />
        </div>
      </div>
      <BenchmarkTags e={e} stats={stats} />
    </div>
  )
}
