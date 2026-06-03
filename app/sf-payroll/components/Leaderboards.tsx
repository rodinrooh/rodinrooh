"use client"

import { useState } from "react"
import type { LeaderCard, Stats } from "../lib/types"
import EmployeeRow from "./EmployeeRow"

type BoardKey = "overtimeKings" | "otBeatBase" | "outEarnedGovernor" | "highestTotalComp"

export default function Leaderboards({ stats }: { stats: Stats }) {
  const [tab, setTab] = useState<BoardKey>("overtimeKings")

  const tabs: { key: BoardKey; label: string; blurb: string }[] = [
    {
      key: "overtimeKings",
      label: "Overtime kings",
      blurb: `Highest overtime as a share of base salary (base ≥ ${usdShort(stats.otPctBaseFloor)}, so the percentages mean something).`,
    },
    {
      key: "otBeatBase",
      label: `OT > salary (${stats.counts.otBeatBase})`,
      blurb: `${stats.counts.otBeatBase} people were paid more in overtime than their entire base salary.`,
    },
    {
      key: "outEarnedGovernor",
      label: `Out-earned the Governor (${stats.counts.overGovernor.toLocaleString()})`,
      blurb: `${stats.counts.overGovernor.toLocaleString()} employees out-earned California's Governor in total compensation. Here are the top 50.`,
    },
    {
      key: "highestTotalComp",
      label: "Highest total comp",
      blurb: "The biggest total-compensation packages in the city, overtime and benefits included.",
    },
  ]

  const board: LeaderCard[] = stats.leaderboards[tab]
  const active = tabs.find((t) => t.key === tab)!

  return (
    <section className="pay-board" id="leaderboards">
      <div className="pay-section-head">
        <h2 className="pay-h2">Leaderboards</h2>
        <p className="pay-section-sub">The records that keep showing up — Police, Sheriff, Fire.</p>
      </div>

      <div className="pay-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`pay-tab${tab === t.key ? " is-active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="pay-board-blurb">{active.blurb}</p>

      <div>
        {board.map((c, i) => (
          <EmployeeRow key={`${c.name}-${i}`} e={c} stats={stats} rank={i + 1} />
        ))}
      </div>
    </section>
  )
}

function usdShort(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US")
}
