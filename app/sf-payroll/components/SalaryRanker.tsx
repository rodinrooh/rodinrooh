"use client"

import { useState } from "react"
import type { Employee, Stats } from "../lib/types"
import { rankBySalary } from "../lib/data"
import { usd } from "../lib/format"

export default function SalaryRanker({ employees, stats }: { employees: Employee[]; stats: Stats }) {
  const [raw, setRaw] = useState("")
  const [result, setResult] = useState<{ outEarn: number; rank: number; total: number; salary: number } | null>(null)

  function run(e?: React.FormEvent) {
    e?.preventDefault()
    const salary = Number(raw.replace(/[^0-9.]/g, ""))
    if (!Number.isFinite(salary) || salary <= 0) {
      setResult(null)
      return
    }
    const r = rankBySalary(employees, salary)
    setResult({ ...r, salary })
  }

  const pctAbove = result ? ((result.outEarn / result.total) * 100) : 0

  return (
    <section className="pay-ranker">
      <div className="pay-section-head">
        <h2 className="pay-h2">Where would you rank?</h2>
        <p className="pay-section-sub">
          Type your total pay. We&apos;ll tell you how many of San Francisco&apos;s {stats.employeeCount.toLocaleString()}{" "}
          city employees out-earn you — and where you&apos;d land. Nothing leaves your browser.
        </p>
      </div>

      <form className="pay-ranker-form" onSubmit={run}>
        <div className="pay-ranker-input">
          <span className="pay-ranker-dollar">$</span>
          <input
            type="text"
            inputMode="numeric"
            placeholder="120,000"
            value={raw}
            onChange={(ev) => setRaw(ev.target.value)}
          />
        </div>
        <button type="submit" className="pay-ranker-btn">
          Rank me
        </button>
      </form>

      {result && (
        <div className="pay-ranker-result">
          <p>
            At <strong>{usd(result.salary)}</strong>, you&apos;d rank{" "}
            <strong className="pay-hl-comp">#{result.rank.toLocaleString()}</strong> of{" "}
            {result.total.toLocaleString()} city employees.
          </p>
          <p className="pay-ranker-sub">
            {result.outEarn.toLocaleString()} of them ({pctAbove.toFixed(1)}%) out-earn you in total compensation.
            {result.outEarn === 0 ? " You'd top the entire city payroll." : ""}
          </p>
        </div>
      )}
    </section>
  )
}
