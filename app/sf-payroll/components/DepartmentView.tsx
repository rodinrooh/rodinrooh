"use client"

import type { Stats } from "../lib/types"
import { usdCompact, usd } from "../lib/format"

export default function DepartmentView({
  stats,
  onSelect,
}: {
  stats: Stats
  onSelect: (department: string) => void
}) {
  const top = stats.departments.slice(0, 12)
  const maxOT = top.length ? top[0].totalOT : 1

  return (
    <section className="pay-depts" id="departments">
      <div className="pay-section-head">
        <h2 className="pay-h2">Where the overtime goes</h2>
        <p className="pay-section-sub">
          Departments by total overtime. A handful of public-safety departments drive most of the city&apos;s
          {" "}{usdCompact(stats.totalOT)} OT bill — exactly where minimum-staffing rules bite hardest.
        </p>
      </div>

      <div className="pay-deptlist">
        {top.map((d) => {
          const share = stats.totalOT > 0 ? (d.totalOT / stats.totalOT) * 100 : 0
          return (
            <button key={d.department} className="pay-deptrow" onClick={() => onSelect(d.department)}>
              <div className="pay-deptrow-top">
                <span className="pay-deptrow-name">{d.department}</span>
                <span className="pay-deptrow-ot">{usd(d.totalOT)}</span>
              </div>
              <div className="pay-deptbar-track">
                <div className="pay-deptbar-fill" style={{ width: `${(d.totalOT / maxOT) * 100}%` }} />
              </div>
              <div className="pay-deptrow-meta">
                {d.employees.toLocaleString()} employees · {share.toFixed(1)}% of citywide OT
                <span className="pay-deptrow-go">View in explorer →</span>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
