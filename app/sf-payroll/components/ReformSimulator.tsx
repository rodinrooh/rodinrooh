"use client"

import { useMemo, useState } from "react"
import type { Employee, Stats } from "../lib/types"
import { usd, usdCompact } from "../lib/format"

export default function ReformSimulator({ employees, stats }: { employees: Employee[]; stats: Stats }) {
  // Cap each person's overtime at X% of their base salary, then recompute the
  // recovered dollars across all ~42.5k real rows, live, on every drag.
  const [capPct, setCapPct] = useState(50)

  const { saved, affected } = useMemo(() => {
    const cap = capPct / 100
    let saved = 0
    let affected = 0
    for (const e of employees) {
      if (e.base > 0) {
        const allowed = e.base * cap
        if (e.ot > allowed) {
          saved += e.ot - allowed
          affected++
        }
      }
    }
    return { saved, affected }
  }, [employees, capPct])

  const homes = Math.round(saved / 700_000)
  const shareOfBill = stats.totalOT > 0 ? (saved / stats.totalOT) * 100 : 0

  return (
    <section className="pay-sim" id="simulator">
      <div className="pay-section-head">
        <h2 className="pay-h2">Find the savings yourself</h2>
        <p className="pay-section-sub">
          Drag the cap. Every city employee whose overtime runs past it gets trimmed to the line, and the
          recovered money is recomputed live across all {stats.employeeCount.toLocaleString()} real 2025 records.
        </p>
      </div>

      <div className="pay-sim-readout">
        <div className="pay-sim-saved">{usdCompact(saved)}</div>
        <div className="pay-sim-savedlabel">recovered · {affected.toLocaleString()} employees trimmed · {shareOfBill.toFixed(0)}% of the OT bill</div>
      </div>

      <div className="pay-sim-control">
        <div className="pay-sim-caplabel">
          Cap overtime at <strong>{capPct}%</strong> of base salary
        </div>
        <input
          className="pay-slider"
          type="range"
          min={0}
          max={300}
          step={5}
          value={capPct}
          onChange={(e) => setCapPct(Number(e.target.value))}
          aria-label="Overtime cap as percent of base salary"
        />
        <div className="pay-slider-ends">
          <span>0% (no overtime)</span>
          <span>300%</span>
        </div>
      </div>

      <p className="pay-sim-note">
        ≈ {homes.toLocaleString()} permanently affordable homes. Back-of-envelope on real pay, not a policy
        proposal — much of this overtime is mandatory, and capping it means hiring more people or cutting
        service. The point is to feel how big the lever is.
      </p>
    </section>
  )
}
