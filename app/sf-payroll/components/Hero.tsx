"use client"

import type { Employee, Stats } from "../lib/types"
import { usd, usdCompact, pct, hoursLabel } from "../lib/format"
import GuessGame from "./GuessGame"

export default function Hero({ stats, employees }: { stats: Stats; employees: Employee[] | null }) {
  const h = stats.hero
  return (
    <header className="pay-hero">
      <div className="pay-hero-kicker">San Francisco · {stats.year} · {stats.employeeCount.toLocaleString()} city employees</div>
      <h1 className="pay-hero-h1">
        SF paid <span className="pay-hl-ot">{usdCompact(stats.totalOT)}</span> in overtime last year.
      </h1>
      <p className="pay-hero-lede">
        Hundreds of city workers made more in overtime than their entire salary. Before you scroll the
        records — <strong>guess what one of them actually took home.</strong>
      </p>

      {employees && <GuessGame employees={employees} stats={stats} />}

      <div className="pay-stat-grid">
        <Stat num={usdCompact(stats.totalOT)} label="paid in overtime, 2025" />
        <Stat num={stats.counts.otBeatBase.toLocaleString()} label="made more in OT than base salary" />
        <Stat num={stats.counts.overGovernor.toLocaleString()} label={`out-earned the Governor (${usd(stats.governorSalary)})`} />
        <Stat num={stats.counts.over4000Hours.toLocaleString()} label="logged 4,000+ paid hours" />
      </div>

      {h && (
        <div className="pay-herocard">
          <div className="pay-herocard-tag">The single most extreme case</div>
          <div className="pay-herocard-name">{h.name}</div>
          <div className="pay-herocard-job">
            {h.job} · {h.department}
          </div>
          <p className="pay-herocard-say">
            Paid <span className="pay-hl-ot">{usd(h.ot)} in overtime</span> on top of a {usd(h.base)} salary — that&apos;s{" "}
            <strong>{pct(h.otPct)} of his pay, again, in overtime alone</strong>. {hoursLabel(h.hours)} paid hours
            on the books; a normal full-time year is about 2,080. Total compensation: {usd(h.totalComp)}.
          </p>
          <p className="pay-herocard-note">
            Read that as a staffing failure, not a scandal: the shifts are mandatory and someone has to work them.
          </p>
        </div>
      )}
    </header>
  )
}

function Stat({ num, label }: { num: string; label: string }) {
  return (
    <div className="pay-stat">
      <div className="pay-stat-num">{num}</div>
      <div className="pay-stat-label">{label}</div>
    </div>
  )
}
