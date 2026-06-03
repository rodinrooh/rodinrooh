"use client"

import { useEffect, useState } from "react"
import type { Employee, Stats } from "./lib/types"
import { loadEmployees, loadStats } from "./lib/data"
import WelcomeModal from "./components/WelcomeModal"
import Hero from "./components/Hero"
import Explorer from "./components/Explorer"
import Leaderboards from "./components/Leaderboards"
import DepartmentView from "./components/DepartmentView"
import OvertimeBill from "./components/OvertimeBill"
import SalaryRanker from "./components/SalaryRanker"

export default function Page() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [employees, setEmployees] = useState<Employee[] | null>(null)
  const [error, setError] = useState(false)
  const [department, setDepartment] = useState("All departments")
  const [aboutOpen, setAboutOpen] = useState(false)

  useEffect(() => {
    loadStats().then(setStats).catch(() => setError(true))
    loadEmployees().then(setEmployees).catch(() => setError(true))
  }, [])

  function selectDepartment(d: string) {
    setDepartment(d)
    requestAnimationFrame(() => {
      document.getElementById("explorer")?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }

  return (
    <div className="pay-root">
      <Style />
      <WelcomeModal />
      {aboutOpen && <WelcomeModal open={aboutOpen} onClose={() => setAboutOpen(false)} />}

      <nav className="pay-nav">
        <a className="pay-nav-brand" href="#top">SF Payroll</a>
        <div className="pay-nav-links">
          <a href="#explorer">Explorer</a>
          <a href="#leaderboards">Leaderboards</a>
          <a href="#departments">Departments</a>
          <button onClick={() => setAboutOpen(true)}>About</button>
        </div>
      </nav>

      <main className="pay-wrap" id="top">
        {error && (
          <div className="pay-loading">Couldn&apos;t load the payroll data. Try refreshing.</div>
        )}

        {!error && !stats && <div className="pay-loading">Loading the city payroll…</div>}

        {stats && (
          <>
            <Hero stats={stats} />

            <DepartmentView stats={stats} onSelect={selectDepartment} />

            {employees ? (
              <Explorer
                employees={employees}
                stats={stats}
                department={department}
                onDepartmentChange={setDepartment}
              />
            ) : (
              <div className="pay-loading">Loading all {stats.employeeCount.toLocaleString()} employees…</div>
            )}

            <Leaderboards stats={stats} />

            <OvertimeBill stats={stats} />

            {employees && <SalaryRanker employees={employees} stats={stats} />}

            <footer className="pay-footer">
              <p>
                Source: DataSF Employee Compensation (dataset 88g8-5mnd), calendar year {stats.year}. Downloaded
                once, served static. Names are part of the public record for 2017 onward.
              </p>
              <p className="pay-footer-frame">
                A note on framing: much of this overtime is mandatory, driven by understaffing and minimum-staffing
                rules. The city&apos;s own Budget &amp; Legislative Analyst found SFPD overtime had doubled to $108M
                with inadequate controls and a &ldquo;risk of overtime fraud or abuse.&rdquo; The story here is a
                broken overtime system with no brakes. The named records are evidence of the system — not an
                accusation against any individual doing the job the city assigned them.
              </p>
              <p className="pay-footer-by">
                By Rodin Roohipour · <a href="/">rodinrooh.com</a>
              </p>
            </footer>
          </>
        )}
      </main>
    </div>
  )
}

function Style() {
  return (
    <style>{`
:root { color-scheme: light; }
.pay-root {
  --ink: #111114; --muted: #6b6b73; --faint: #9b9ba3; --line: #ececec;
  --ot: #d6480a; --gov: #1f57d6; --red: #d22b2b;
  background: #fff; color: var(--ink); min-height: 100vh;
  -webkit-font-smoothing: antialiased; letter-spacing: -0.011em;
}
.pay-root a { color: inherit; }
.pay-root * { box-sizing: border-box; }
.pay-root strong { font-weight: 650; }

/* nav */
.pay-nav {
  position: sticky; top: 0; z-index: 40;
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 28px; background: rgba(255,255,255,0.82); backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--line);
}
.pay-nav-brand { font-weight: 700; font-size: 15px; text-decoration: none; }
.pay-nav-links { display: flex; gap: 22px; align-items: center; }
.pay-nav-links a, .pay-nav-links button {
  color: var(--muted); text-decoration: none; font-size: 14px; padding: 0;
  background: none; border: none; cursor: pointer; font: inherit;
}
.pay-nav-links a:hover, .pay-nav-links button:hover { color: var(--ink); }

.pay-wrap { max-width: 760px; margin: 0 auto; padding: 0 28px 120px; }
.pay-loading { padding: 100px 0; text-align: center; color: var(--muted); font-size: 15px; }

/* hero */
.pay-hero { padding: 72px 0 8px; }
.pay-hero-kicker { color: var(--faint); font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
.pay-hero-h1 { font-size: clamp(40px, 7vw, 68px); line-height: 1.02; font-weight: 800; letter-spacing: -0.035em; margin: 18px 0 0; }
.pay-hl-ot { color: var(--ot); }
.pay-hl-comp { font-weight: 700; }
.pay-hero-lede { font-size: clamp(17px, 2.4vw, 21px); color: var(--muted); max-width: 600px; line-height: 1.5; margin: 24px 0 0; }
.pay-hero-lede strong { color: var(--ink); }

/* stat strip — no boxes, just numbers + hairline */
.pay-stat-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 28px;
  margin: 52px 0 0; padding: 30px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line);
}
.pay-stat-num { font-size: clamp(26px, 3.4vw, 34px); font-weight: 800; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
.pay-stat-label { color: var(--muted); font-size: 13px; line-height: 1.4; margin-top: 8px; }

/* most-extreme block — set apart by a thin accent rule, not a box */
.pay-herocard { margin: 44px 0 0; padding: 4px 0 0 22px; border-left: 3px solid var(--ot); }
.pay-herocard-tag { color: var(--ot); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
.pay-herocard-name { font-size: 28px; font-weight: 800; letter-spacing: -0.03em; margin-top: 10px; }
.pay-herocard-job { color: var(--muted); font-size: 14px; margin-top: 3px; }
.pay-herocard-say { font-size: 18px; line-height: 1.6; margin: 18px 0 0; color: #2a2a30; }
.pay-herocard-say strong { color: var(--ink); }
.pay-herocard-note { font-size: 14px; color: var(--faint); margin: 14px 0 0; font-style: italic; }

/* section scaffolding */
.pay-section-head { margin: 92px 0 26px; }
.pay-h2 { font-size: clamp(24px, 3.4vw, 32px); font-weight: 800; letter-spacing: -0.03em; margin: 0; }
.pay-section-sub { color: var(--muted); font-size: 16px; line-height: 1.55; margin: 10px 0 0; max-width: 620px; }

/* controls */
.pay-controls { display: flex; gap: 10px; flex-wrap: wrap; }
.pay-search {
  flex: 1 1 300px; background: #fff; border: 1px solid #dadada; color: var(--ink);
  border-radius: 10px; padding: 13px 15px; font: inherit; font-size: 15px; outline: none;
}
.pay-search:focus { border-color: var(--ink); }
.pay-search::placeholder { color: var(--faint); }
.pay-select {
  background: #fff; border: 1px solid #dadada; color: var(--ink);
  border-radius: 10px; padding: 13px 15px; font: inherit; font-size: 14px; outline: none; max-width: 100%;
}
.pay-select:focus { border-color: var(--ink); }
.pay-sortrow { display: flex; gap: 4px 18px; align-items: center; flex-wrap: wrap; margin: 22px 0 0; }
.pay-sortlabel { color: var(--faint); font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; margin-right: 4px; }
.pay-sortbtn {
  background: none; border: none; color: var(--faint); padding: 4px 0; font: inherit; font-size: 14px;
  cursor: pointer; border-bottom: 2px solid transparent;
}
.pay-sortbtn:hover { color: var(--ink); }
.pay-sortbtn.is-active { color: var(--ink); font-weight: 600; border-bottom-color: var(--ink); }
.pay-resultcount { color: var(--faint); font-size: 13px; margin: 24px 0 4px; }
.pay-empty { padding: 56px 0; text-align: center; color: var(--muted); }

/* employee row — list, hairline divider, no card */
.pay-row { padding: 18px 0; border-bottom: 1px solid var(--line); }
.pay-row-head { display: flex; align-items: baseline; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
.pay-row-id { display: flex; gap: 14px; align-items: baseline; min-width: 0; }
.pay-rank { color: var(--faint); font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; min-width: 28px; flex-shrink: 0; }
.pay-row-name { font-size: 17px; font-weight: 650; letter-spacing: -0.01em; }
.pay-row-sub { color: var(--muted); font-size: 13px; margin-top: 2px; }
.pay-row-nums { display: flex; gap: 26px; flex-wrap: wrap; }
.pay-num { text-align: right; min-width: 72px; }
.pay-num-val { font-size: 16px; font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
.pay-num-val.is-ot { color: var(--ot); }
.pay-num-val.is-comp { color: var(--ink); }
.pay-num-label { color: var(--faint); font-size: 11px; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.03em; }

.pay-tags { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 12px; }
.pay-tag { font-size: 12px; padding: 3px 9px; border-radius: 6px; font-weight: 550; }
.pay-tag.is-ot { color: var(--ot); background: #fdf0e9; }
.pay-tag.is-gov { color: var(--gov); background: #eaf0fd; }
.pay-tag.is-hours { color: var(--red); background: #fcecec; }

/* tabs */
.pay-tabs { display: flex; gap: 22px; flex-wrap: wrap; margin-bottom: 18px; border-bottom: 1px solid var(--line); }
.pay-tab {
  background: none; border: none; color: var(--faint); padding: 0 0 12px; font: inherit; font-size: 14px;
  cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.pay-tab:hover { color: var(--ink); }
.pay-tab.is-active { color: var(--ink); font-weight: 600; border-bottom-color: var(--ink); }
.pay-board-blurb { color: var(--muted); font-size: 15px; margin: 0 0 20px; line-height: 1.5; }

/* departments — clean rows with a thin bar */
.pay-deptlist { display: flex; flex-direction: column; }
.pay-deptrow {
  text-align: left; background: none; border: none; border-bottom: 1px solid var(--line);
  padding: 16px 0; cursor: pointer; font: inherit; color: inherit; width: 100%;
}
.pay-deptrow:hover .pay-deptrow-name { text-decoration: underline; }
.pay-deptrow:hover .pay-deptrow-go { opacity: 1; }
.pay-deptrow-top { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.pay-deptrow-name { font-size: 16px; font-weight: 650; }
.pay-deptrow-ot { font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; }
.pay-deptbar-track { height: 5px; background: #f0f0f0; border-radius: 999px; margin: 11px 0 9px; overflow: hidden; }
.pay-deptbar-fill { height: 100%; background: var(--ot); border-radius: 999px; }
.pay-deptrow-meta { color: var(--faint); font-size: 13px; display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.pay-deptrow-go { color: var(--gov); opacity: 0; transition: opacity 0.15s; }

/* overtime bill — plain number columns, no boxes */
.pay-billgrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 28px; border-top: 1px solid var(--line); padding-top: 32px; }
.pay-billcard { text-align: left; }
.pay-bill-emoji { font-size: 24px; }
.pay-bill-count { font-size: clamp(26px, 3.6vw, 34px); font-weight: 800; letter-spacing: -0.03em; margin-top: 10px; font-variant-numeric: tabular-nums; }
.pay-bill-noun { color: var(--muted); font-size: 14px; line-height: 1.4; margin-top: 6px; }
.pay-bill-each { color: var(--faint); font-size: 12px; margin-top: 6px; }

/* salary ranker */
.pay-ranker-form { display: flex; gap: 10px; flex-wrap: wrap; }
.pay-ranker-input { display: flex; align-items: center; background: #fff; border: 1px solid #dadada; border-radius: 10px; padding: 0 14px; flex: 1 1 240px; }
.pay-ranker-input:focus-within { border-color: var(--ink); }
.pay-ranker-dollar { color: var(--faint); font-size: 18px; font-weight: 700; }
.pay-ranker-input input { background: none; border: none; outline: none; color: var(--ink); font: inherit; font-size: 18px; font-weight: 700; padding: 14px 8px; width: 100%; font-variant-numeric: tabular-nums; }
.pay-ranker-btn { background: var(--ink); color: #fff; border: none; border-radius: 10px; padding: 0 24px; font: inherit; font-size: 15px; font-weight: 600; cursor: pointer; }
.pay-ranker-btn:active { opacity: 0.8; }
.pay-ranker-result { margin-top: 22px; }
.pay-ranker-result p { margin: 0; font-size: 20px; line-height: 1.5; }
.pay-ranker-result strong { font-weight: 800; }
.pay-ranker-sub { color: var(--muted); font-size: 15px !important; margin-top: 8px !important; }

/* footer */
.pay-footer { margin-top: 96px; padding-top: 32px; border-top: 1px solid var(--line); color: var(--faint); font-size: 13px; line-height: 1.65; }
.pay-footer p { margin: 0 0 14px; max-width: 680px; }
.pay-footer-frame { color: var(--muted); }
.pay-footer a { color: var(--gov); }

/* welcome modal — light, minimal */
.pay-modal-scrim { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(20,20,24,0.32); backdrop-filter: blur(6px); }
.pay-modal { width: 100%; max-width: 440px; max-height: 90vh; overflow-y: auto; background: #fff; border-radius: 18px; padding: 30px; box-shadow: 0 30px 80px rgba(0,0,0,0.18); }
.pay-modal-head { display: flex; align-items: center; gap: 14px; }
.pay-modal-emoji { font-size: 34px; }
.pay-modal-title { font-size: 22px; font-weight: 800; margin: 0; letter-spacing: -0.02em; }
.pay-modal-sub { color: var(--muted); font-size: 13px; margin: 2px 0 0; }
.pay-modal-body { margin: 24px 0 8px; display: flex; flex-direction: column; gap: 18px; }
.pay-modal-row { display: flex; gap: 12px; }
.pay-modal-row-icon { font-size: 17px; flex-shrink: 0; margin-top: 1px; }
.pay-modal-row-title { font-size: 14px; font-weight: 700; }
.pay-modal-row-body { color: var(--muted); font-size: 13.5px; line-height: 1.5; margin-top: 2px; }
.pay-modal-btn { width: 100%; margin-top: 20px; background: var(--ink); color: #fff; border: none; border-radius: 11px; padding: 14px; font: inherit; font-size: 15px; font-weight: 600; cursor: pointer; }
.pay-modal-btn:active { opacity: 0.85; }
.pay-modal-fine { color: var(--faint); font-size: 11px; text-align: center; margin: 16px 0 0; line-height: 1.5; }

@media (max-width: 720px) {
  .pay-nav { padding: 16px 20px; }
  .pay-nav-links { gap: 16px; }
  .pay-nav-links a:not([href="#explorer"]) { display: none; }
  .pay-wrap { padding: 0 20px 90px; }
  .pay-stat-grid { grid-template-columns: 1fr 1fr; gap: 22px; }
  .pay-billgrid { grid-template-columns: 1fr 1fr; gap: 22px; }
  .pay-row-head { flex-direction: column; gap: 12px; }
  .pay-row-nums { gap: 0; width: 100%; justify-content: space-between; }
  .pay-num { min-width: 0; flex: 1 1 30%; text-align: left; }
  .pay-num-val { font-size: 15px; }
}
`}</style>
  )
}
