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
        <a className="pay-nav-brand" href="#top">💸 SF Payroll</a>
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
:root { color-scheme: dark; }
.pay-root {
  --bg: #0a0a0c; --panel: #141418; --panel2: #1a1a21; --border: #272730;
  --text: #e9e9ee; --muted: #9a9aa4; --faint: #66666f;
  --ot: #f5b942; --comp: #4ade80; --gov: #6aa6ff; --red: #ff6b6b;
  background: var(--bg); color: var(--text); min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}
.pay-root a { color: inherit; }
.pay-root * { box-sizing: border-box; }

/* nav */
.pay-nav {
  position: sticky; top: 0; z-index: 40;
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 20px; background: rgba(10,10,12,0.82); backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border);
}
.pay-nav-brand { font-weight: 700; font-size: 15px; text-decoration: none; letter-spacing: -0.01em; }
.pay-nav-links { display: flex; gap: 4px; align-items: center; }
.pay-nav-links a, .pay-nav-links button {
  color: var(--muted); text-decoration: none; font-size: 13px; padding: 6px 10px;
  border-radius: 8px; background: none; border: none; cursor: pointer; font: inherit;
}
.pay-nav-links a:hover, .pay-nav-links button:hover { color: var(--text); background: var(--panel); }

.pay-wrap { max-width: 1000px; margin: 0 auto; padding: 0 20px 80px; }
.pay-loading { padding: 80px 0; text-align: center; color: var(--muted); font-size: 15px; }

/* hero */
.pay-hero { padding: 56px 0 40px; }
.pay-hero-kicker { color: var(--faint); font-size: 13px; font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase; }
.pay-hero-h1 { font-size: clamp(34px, 6vw, 60px); line-height: 1.04; font-weight: 800; letter-spacing: -0.03em; margin: 14px 0 0; }
.pay-hl-ot { color: var(--ot); }
.pay-hl-comp { color: var(--comp); }
.pay-hero-lede { font-size: clamp(16px, 2.4vw, 20px); color: var(--muted); max-width: 640px; line-height: 1.55; margin: 18px 0 0; }
.pay-hero-lede strong { color: var(--text); font-weight: 600; }

.pay-stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 36px 0 0; }
.pay-stat { background: var(--panel); border: 1px solid var(--border); border-radius: 14px; padding: 18px 16px; }
.pay-stat-num { font-size: clamp(22px, 3.4vw, 30px); font-weight: 800; letter-spacing: -0.02em; }
.pay-stat-label { color: var(--muted); font-size: 12.5px; line-height: 1.4; margin-top: 6px; }

.pay-herocard {
  margin: 28px 0 0; background: linear-gradient(160deg, #1c1813, #141418 60%);
  border: 1px solid #3a3320; border-radius: 18px; padding: 24px;
}
.pay-herocard-tag { color: var(--ot); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
.pay-herocard-name { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; margin-top: 8px; }
.pay-herocard-job { color: var(--muted); font-size: 14px; margin-top: 2px; }
.pay-herocard-say { font-size: 17px; line-height: 1.6; margin: 16px 0 0; color: #d8d8de; }
.pay-herocard-say strong { color: var(--text); }
.pay-herocard-note { font-size: 13.5px; color: var(--faint); margin: 12px 0 0; font-style: italic; }

/* section scaffolding */
.pay-section-head { margin: 64px 0 20px; }
.pay-h2 { font-size: clamp(22px, 3.2vw, 30px); font-weight: 800; letter-spacing: -0.02em; margin: 0; }
.pay-section-sub { color: var(--muted); font-size: 15px; line-height: 1.55; margin: 8px 0 0; max-width: 680px; }

/* controls */
.pay-controls { display: flex; gap: 10px; flex-wrap: wrap; }
.pay-search {
  flex: 1 1 320px; background: var(--panel); border: 1px solid var(--border); color: var(--text);
  border-radius: 12px; padding: 13px 15px; font-size: 15px; outline: none;
}
.pay-search:focus { border-color: #44444f; }
.pay-search::placeholder { color: var(--faint); }
.pay-select {
  background: var(--panel); border: 1px solid var(--border); color: var(--text);
  border-radius: 12px; padding: 13px 15px; font-size: 14px; outline: none; max-width: 100%;
}
.pay-sortrow { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 14px 0 0; }
.pay-sortlabel { color: var(--faint); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; margin-right: 2px; }
.pay-sortbtn {
  background: var(--panel); border: 1px solid var(--border); color: var(--muted);
  border-radius: 999px; padding: 7px 14px; font-size: 13px; cursor: pointer; font: inherit;
}
.pay-sortbtn:hover { color: var(--text); }
.pay-sortbtn.is-active { background: var(--text); color: #0a0a0c; border-color: var(--text); font-weight: 600; }
.pay-resultcount { color: var(--faint); font-size: 13px; margin: 16px 2px; }
.pay-empty { padding: 48px 0; text-align: center; color: var(--muted); }

/* employee row */
.pay-row {
  background: var(--panel); border: 1px solid var(--border); border-radius: 14px;
  padding: 16px 18px; margin-bottom: 10px;
}
.pay-row-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.pay-row-id { display: flex; gap: 12px; align-items: baseline; min-width: 0; }
.pay-rank {
  color: var(--faint); font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums;
  min-width: 26px; flex-shrink: 0;
}
.pay-row-name { font-size: 17px; font-weight: 700; letter-spacing: -0.01em; }
.pay-row-sub { color: var(--muted); font-size: 13px; margin-top: 2px; }
.pay-row-nums { display: flex; gap: 22px; flex-wrap: wrap; }
.pay-num { text-align: right; min-width: 76px; }
.pay-num-val { font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
.pay-num-val.is-ot { color: var(--ot); }
.pay-num-val.is-comp { color: var(--comp); }
.pay-num-label { color: var(--faint); font-size: 11px; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.03em; }

.pay-tags { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 12px; }
.pay-tag { font-size: 12px; padding: 4px 10px; border-radius: 999px; font-weight: 600; border: 1px solid transparent; }
.pay-tag.is-ot { color: var(--ot); background: rgba(245,185,66,0.10); border-color: rgba(245,185,66,0.28); }
.pay-tag.is-gov { color: var(--gov); background: rgba(106,166,255,0.10); border-color: rgba(106,166,255,0.28); }
.pay-tag.is-hours { color: var(--red); background: rgba(255,107,107,0.10); border-color: rgba(255,107,107,0.28); }

/* tabs */
.pay-tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.pay-tab {
  background: var(--panel); border: 1px solid var(--border); color: var(--muted);
  border-radius: 10px; padding: 9px 14px; font-size: 13px; cursor: pointer; font: inherit;
}
.pay-tab:hover { color: var(--text); }
.pay-tab.is-active { background: var(--panel2); color: var(--text); border-color: #44444f; font-weight: 600; }
.pay-board-blurb { color: var(--muted); font-size: 14px; margin: 0 0 18px; line-height: 1.5; }

/* departments */
.pay-deptlist { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.pay-deptrow {
  text-align: left; background: var(--panel); border: 1px solid var(--border); border-radius: 14px;
  padding: 16px 18px; cursor: pointer; font: inherit; color: inherit; transition: border-color 0.15s;
}
.pay-deptrow:hover { border-color: #44444f; }
.pay-deptrow-top { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.pay-deptrow-name { font-size: 15px; font-weight: 700; }
.pay-deptrow-ot { font-size: 15px; font-weight: 700; color: var(--ot); font-variant-numeric: tabular-nums; }
.pay-deptbar-track { height: 6px; background: #232329; border-radius: 999px; margin: 12px 0 10px; overflow: hidden; }
.pay-deptbar-fill { height: 100%; background: linear-gradient(90deg, #f5b942, #f59042); border-radius: 999px; }
.pay-deptrow-meta { color: var(--faint); font-size: 12.5px; display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.pay-deptrow-go { color: var(--gov); }

/* overtime bill */
.pay-billgrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.pay-billcard { background: var(--panel); border: 1px solid var(--border); border-radius: 14px; padding: 22px 18px; text-align: center; }
.pay-bill-emoji { font-size: 30px; }
.pay-bill-count { font-size: clamp(24px, 3.6vw, 32px); font-weight: 800; letter-spacing: -0.02em; margin-top: 8px; }
.pay-bill-noun { color: var(--muted); font-size: 13.5px; line-height: 1.4; margin-top: 6px; }
.pay-bill-each { color: var(--faint); font-size: 12px; margin-top: 6px; }

/* salary ranker */
.pay-ranker-form { display: flex; gap: 10px; flex-wrap: wrap; }
.pay-ranker-input { display: flex; align-items: center; background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 0 14px; flex: 1 1 240px; }
.pay-ranker-input:focus-within { border-color: #44444f; }
.pay-ranker-dollar { color: var(--faint); font-size: 18px; font-weight: 700; }
.pay-ranker-input input { background: none; border: none; outline: none; color: var(--text); font-size: 18px; font-weight: 700; padding: 14px 8px; width: 100%; font-variant-numeric: tabular-nums; }
.pay-ranker-btn { background: var(--comp); color: #04210f; border: none; border-radius: 12px; padding: 0 22px; font-size: 15px; font-weight: 700; cursor: pointer; }
.pay-ranker-result { background: var(--panel); border: 1px solid var(--border); border-radius: 14px; padding: 20px 22px; margin-top: 14px; }
.pay-ranker-result p { margin: 0; font-size: 18px; line-height: 1.5; }
.pay-ranker-result strong { font-weight: 800; }
.pay-ranker-sub { color: var(--muted); font-size: 14px !important; margin-top: 8px !important; }

/* footer */
.pay-footer { margin-top: 72px; padding-top: 28px; border-top: 1px solid var(--border); color: var(--faint); font-size: 13px; line-height: 1.6; }
.pay-footer p { margin: 0 0 12px; max-width: 760px; }
.pay-footer-frame { color: var(--muted); }
.pay-footer a { color: var(--gov); }
.pay-footer-by { color: var(--faint); }

/* welcome modal */
.pay-modal-scrim { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); }
.pay-modal { width: 100%; max-width: 440px; max-height: 90vh; overflow-y: auto; background: #131318; border: 1px solid var(--border); border-radius: 20px; padding: 26px; }
.pay-modal-head { display: flex; align-items: center; gap: 14px; }
.pay-modal-emoji { font-size: 36px; }
.pay-modal-title { font-size: 22px; font-weight: 800; margin: 0; letter-spacing: -0.02em; }
.pay-modal-sub { color: var(--muted); font-size: 13px; margin: 2px 0 0; }
.pay-modal-body { margin: 22px 0 8px; display: flex; flex-direction: column; gap: 16px; }
.pay-modal-row { display: flex; gap: 12px; }
.pay-modal-row-icon { font-size: 18px; flex-shrink: 0; margin-top: 1px; }
.pay-modal-row-title { font-size: 14px; font-weight: 700; }
.pay-modal-row-body { color: var(--muted); font-size: 13.5px; line-height: 1.5; margin-top: 2px; }
.pay-modal-btn { width: 100%; margin-top: 18px; background: var(--text); color: #0a0a0c; border: none; border-radius: 12px; padding: 14px; font-size: 15px; font-weight: 700; cursor: pointer; }
.pay-modal-btn:active { opacity: 0.8; }
.pay-modal-fine { color: var(--faint); font-size: 11px; text-align: center; margin: 14px 0 0; line-height: 1.5; }

@media (max-width: 720px) {
  .pay-nav-links a:not([href="#explorer"]) { display: none; }
  .pay-stat-grid { grid-template-columns: 1fr 1fr; }
  .pay-billgrid { grid-template-columns: 1fr 1fr; }
  .pay-deptlist { grid-template-columns: 1fr; }
  .pay-row-head { flex-direction: column; gap: 12px; }
  .pay-row-nums { gap: 0; width: 100%; justify-content: space-between; }
  .pay-num { min-width: 0; flex: 1 1 30%; text-align: left; }
  .pay-num-val { font-size: 15px; }
}
`}</style>
  )
}
