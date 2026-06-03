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
          <a href="#leaderboards">Leaderboards</a>
          <a href="#departments">Departments</a>
          <a href="#explorer">Look up anyone</a>
          <button onClick={() => setAboutOpen(true)}>About</button>
        </div>
      </nav>

      <main className="pay-wrap" id="top">
        {error && <div className="pay-loading">Couldn&apos;t load the payroll data. Try refreshing.</div>}

        {!error && !stats && <div className="pay-loading">Loading the city payroll…</div>}

        {stats && (
          <>
            <Hero stats={stats} />

            <Leaderboards stats={stats} />

            <DepartmentView stats={stats} onSelect={selectDepartment} />

            <OvertimeBill stats={stats} />

            {employees && <SalaryRanker employees={employees} stats={stats} />}

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

            <footer className="pay-footer">
              <p>
                Source: DataSF Employee Compensation (dataset 88g8-5mnd), calendar year {stats.year}. Downloaded
                once, served static. Names are part of the public record for 2017 onward.
              </p>
              <p className="pay-footer-frame">
                Much of this overtime is mandatory — driven by understaffing and minimum-staffing rules. The
                city&apos;s own Budget &amp; Legislative Analyst found SFPD overtime had doubled to $108M with
                inadequate controls and a &ldquo;risk of overtime fraud or abuse.&rdquo; The story is a broken
                overtime system with no brakes — not any one person doing the job the city assigned them.
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
  --ink: #17171a; --muted: #6c6c74; --faint: #9a9aa2; --hair: #ededed; --rule: #e3e3e3;
  --ot: #cf4b17;
  background: #fff; color: var(--ink); min-height: 100vh;
  -webkit-font-smoothing: antialiased; letter-spacing: -0.011em; font-size: 16px;
  overflow-x: hidden;
}
.pay-root { max-width: 100vw; }
.pay-row-name, .pay-deptrow-name, .pay-bill-noun { overflow-wrap: anywhere; }
.pay-root a { color: inherit; }
.pay-root * { box-sizing: border-box; }
.pay-root strong { font-weight: 640; }

/* nav */
.pay-nav {
  position: sticky; top: 0; z-index: 40;
  display: flex; align-items: center; justify-content: space-between;
  padding: 17px 26px; background: rgba(255,255,255,0.85); backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--hair);
}
.pay-nav-brand { font-weight: 680; font-size: 15px; text-decoration: none; letter-spacing: -0.02em; }
.pay-nav-links { display: flex; gap: 24px; align-items: center; }
.pay-nav-links a, .pay-nav-links button {
  color: var(--muted); text-decoration: none; font-size: 14px; padding: 0;
  background: none; border: none; cursor: pointer; font: inherit;
}
.pay-nav-links a:hover, .pay-nav-links button:hover { color: var(--ink); }

.pay-wrap { max-width: 740px; margin: 0 auto; padding: 0 26px 130px; }
.pay-loading { padding: 120px 0; text-align: center; color: var(--muted); font-size: 15px; }

/* hero */
.pay-hero { padding: 76px 0 0; }
.pay-hero-kicker { color: var(--faint); font-size: 12px; font-weight: 600; letter-spacing: 0.07em; text-transform: uppercase; }
.pay-hero-h1 { font-size: clamp(38px, 6.6vw, 60px); line-height: 1.0; font-weight: 800; letter-spacing: -0.04em; margin: 20px 0 0; }
.pay-hl-ot { color: var(--ot); }
.pay-hl-comp { font-weight: 700; }
.pay-hero-lede { font-size: clamp(17px, 2.3vw, 20px); color: var(--muted); max-width: 560px; line-height: 1.5; margin: 24px 0 0; }
.pay-hero-lede strong { color: var(--ink); }

/* stat strip — numbers on a single hairline, no boxes */
.pay-stat-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px;
  margin: 52px 0 0; padding-top: 28px; border-top: 1px solid var(--rule);
}
.pay-stat-num { font-size: clamp(24px, 3.2vw, 30px); font-weight: 800; letter-spacing: -0.035em; font-variant-numeric: tabular-nums; }
.pay-stat-label { color: var(--muted); font-size: 12.5px; line-height: 1.35; margin-top: 7px; }

/* most-extreme case — thin accent rule, not a box */
.pay-herocard { margin: 56px 0 0; padding: 2px 0 0 20px; border-left: 2px solid var(--ot); }
.pay-herocard-tag { color: var(--ot); font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
.pay-herocard-name { font-size: 27px; font-weight: 800; letter-spacing: -0.035em; margin-top: 12px; }
.pay-herocard-job { color: var(--muted); font-size: 14px; margin-top: 3px; }
.pay-herocard-say { font-size: 18px; line-height: 1.6; margin: 18px 0 0; color: #2c2c32; }
.pay-herocard-say strong { color: var(--ink); }
.pay-herocard-note { font-size: 14px; color: var(--faint); margin: 14px 0 0; }

/* section scaffolding */
.pay-section-head { margin: 78px 0 22px; }
.pay-h2 { font-size: clamp(23px, 3vw, 29px); font-weight: 780; letter-spacing: -0.035em; margin: 0; }
.pay-section-sub { color: var(--muted); font-size: 15.5px; line-height: 1.5; margin: 9px 0 0; max-width: 580px; }

/* controls */
.pay-controls { display: flex; gap: 10px; flex-wrap: wrap; }
.pay-search {
  flex: 1 1 300px; background: #fff; border: 1px solid #d8d8d8; color: var(--ink);
  border-radius: 9px; padding: 12px 14px; font: inherit; font-size: 15px; outline: none;
}
.pay-search:focus { border-color: var(--ink); }
.pay-search::placeholder { color: var(--faint); }
.pay-select {
  background: #fff; border: 1px solid #d8d8d8; color: var(--ink);
  border-radius: 9px; padding: 12px 14px; font: inherit; font-size: 14px; outline: none; max-width: 100%;
}
.pay-select:focus { border-color: var(--ink); }
.pay-sortrow { display: flex; gap: 6px 18px; align-items: center; flex-wrap: wrap; margin: 16px 0 0; }
.pay-sortlabel { color: var(--faint); font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; }
.pay-sortbtn {
  background: none; border: none; color: var(--faint); padding: 3px 0; font: inherit; font-size: 14px;
  cursor: pointer; border-bottom: 1.5px solid transparent;
}
.pay-sortbtn:hover { color: var(--ink); }
.pay-sortbtn.is-active { color: var(--ink); font-weight: 600; border-bottom-color: var(--ink); }
.pay-resultcount { color: var(--faint); font-size: 12.5px; margin-left: auto; font-variant-numeric: tabular-nums; }
.pay-empty { padding: 60px 0; text-align: center; color: var(--muted); }

/* explorer scroll container — self-contained, never hijacks page scroll */
.pay-scroll {
  margin-top: 14px; max-height: 600px; overflow-y: auto; overscroll-behavior: contain;
  border-top: 1px solid var(--rule);
}
.pay-scroll::-webkit-scrollbar { width: 9px; }
.pay-scroll::-webkit-scrollbar-thumb { background: #dcdcdc; border-radius: 9px; border: 2px solid #fff; }

/* employee row — list with hairline divider, two numbers, one quiet meta line */
.pay-row { padding: 16px 2px; border-bottom: 1px solid var(--hair); }
.pay-row-head { display: flex; align-items: baseline; justify-content: space-between; gap: 20px; }
.pay-row-id { display: flex; gap: 13px; align-items: baseline; min-width: 0; }
.pay-row-idtext { min-width: 0; }
.pay-rank { color: var(--faint); font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; min-width: 26px; flex-shrink: 0; }
.pay-row-name { font-size: 16px; font-weight: 620; letter-spacing: -0.015em; }
.pay-row-sub { color: var(--muted); font-size: 13px; margin-top: 2px; }
.pay-row-nums { display: flex; gap: 28px; flex-shrink: 0; }
.pay-num { text-align: right; }
.pay-num-val { font-size: 15.5px; font-weight: 640; font-variant-numeric: tabular-nums; letter-spacing: -0.015em; }
.pay-num-val.is-ot { color: var(--ot); }
.pay-num-label { color: var(--faint); font-size: 10.5px; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.04em; }

/* quiet meta line — facts + flags separated by middots, only OT is colored */
.pay-meta { display: flex; flex-wrap: wrap; align-items: baseline; margin-top: 9px; font-size: 12.5px; color: var(--faint); font-variant-numeric: tabular-nums; }
.pay-meta > span { white-space: nowrap; }
.pay-meta > span + span::before { content: "·"; margin: 0 8px; color: #d2d2d2; }
.pay-meta-item.is-ot { color: var(--ot); font-weight: 550; }
.pay-meta-item.is-gov { color: var(--ink); font-weight: 550; }

/* tabs */
.pay-tabs { display: flex; gap: 22px; flex-wrap: wrap; margin-bottom: 6px; border-bottom: 1px solid var(--rule); }
.pay-tab {
  background: none; border: none; color: var(--faint); padding: 0 0 12px; font: inherit; font-size: 14px;
  cursor: pointer; border-bottom: 1.5px solid transparent; margin-bottom: -1px;
}
.pay-tab:hover { color: var(--ink); }
.pay-tab.is-active { color: var(--ink); font-weight: 600; border-bottom-color: var(--ink); }
.pay-board-blurb { color: var(--muted); font-size: 14.5px; margin: 16px 0 4px; line-height: 1.5; }

/* departments — clean rows with a thin bar */
.pay-deptlist { display: flex; flex-direction: column; border-top: 1px solid var(--rule); }
.pay-deptrow {
  text-align: left; background: none; border: none; border-bottom: 1px solid var(--hair);
  padding: 15px 2px; cursor: pointer; font: inherit; color: inherit; width: 100%;
}
.pay-deptrow:hover .pay-deptrow-name { text-decoration: underline; }
.pay-deptrow:hover .pay-deptrow-go { opacity: 1; }
.pay-deptrow-top { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.pay-deptrow-name { font-size: 15.5px; font-weight: 620; }
.pay-deptrow-ot { font-size: 15.5px; font-weight: 680; font-variant-numeric: tabular-nums; }
.pay-deptbar-track { height: 4px; background: #efefef; border-radius: 999px; margin: 10px 0 8px; overflow: hidden; }
.pay-deptbar-fill { height: 100%; background: var(--ot); border-radius: 999px; }
.pay-deptrow-meta { color: var(--faint); font-size: 12.5px; display: flex; justify-content: space-between; gap: 8px; }
.pay-deptrow-go { color: var(--ot); opacity: 0; transition: opacity 0.15s; }

/* overtime bill — plain number list, no boxes */
.pay-billlist { border-top: 1px solid var(--rule); }
.pay-billrow { display: flex; align-items: baseline; gap: 20px; padding: 18px 2px; border-bottom: 1px solid var(--hair); }
.pay-bill-count { font-size: clamp(24px, 3.4vw, 31px); font-weight: 800; letter-spacing: -0.04em; font-variant-numeric: tabular-nums; min-width: 130px; }
.pay-bill-noun { font-size: 16px; font-weight: 540; }
.pay-bill-each { color: var(--faint); font-size: 13px; margin-top: 2px; }

/* salary ranker */
.pay-ranker-form { display: flex; gap: 10px; flex-wrap: wrap; }
.pay-ranker-input { display: flex; align-items: center; background: #fff; border: 1px solid #d8d8d8; border-radius: 9px; padding: 0 14px; flex: 1 1 240px; }
.pay-ranker-input:focus-within { border-color: var(--ink); }
.pay-ranker-dollar { color: var(--faint); font-size: 18px; font-weight: 700; }
.pay-ranker-input input { background: none; border: none; outline: none; color: var(--ink); font: inherit; font-size: 18px; font-weight: 700; padding: 13px 8px; width: 100%; font-variant-numeric: tabular-nums; }
.pay-ranker-btn { background: var(--ink); color: #fff; border: none; border-radius: 9px; padding: 0 24px; font: inherit; font-size: 15px; font-weight: 580; cursor: pointer; }
.pay-ranker-btn:active { opacity: 0.85; }
.pay-ranker-result { margin-top: 24px; }
.pay-ranker-result p { margin: 0; font-size: 21px; line-height: 1.45; letter-spacing: -0.02em; }
.pay-ranker-result strong { font-weight: 800; }
.pay-ranker-sub { color: var(--muted); font-size: 15px !important; margin-top: 8px !important; letter-spacing: -0.01em; }

/* footer */
.pay-footer { margin-top: 100px; padding-top: 30px; border-top: 1px solid var(--rule); color: var(--faint); font-size: 13px; line-height: 1.65; }
.pay-footer p { margin: 0 0 14px; max-width: 660px; }
.pay-footer-frame { color: var(--muted); }
.pay-footer a { color: var(--ink); text-decoration: underline; text-underline-offset: 2px; }

/* welcome modal — light, minimal, no emoji */
.pay-modal-scrim { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(20,20,24,0.28); backdrop-filter: blur(5px); }
.pay-modal { width: 100%; max-width: 432px; max-height: 90vh; overflow-y: auto; background: #fff; border-radius: 16px; padding: 30px; box-shadow: 0 24px 70px rgba(0,0,0,0.16); }
.pay-modal-title { font-size: 23px; font-weight: 800; margin: 0; letter-spacing: -0.03em; }
.pay-modal-sub { color: var(--muted); font-size: 14px; margin: 6px 0 0; }
.pay-modal-body { margin: 22px 0 0; }
.pay-modal-body p { font-size: 14.5px; line-height: 1.55; color: var(--muted); margin: 0 0 14px; }
.pay-modal-src { color: var(--faint) !important; font-size: 12.5px !important; }
.pay-modal-btn { width: 100%; margin-top: 12px; background: var(--ink); color: #fff; border: none; border-radius: 10px; padding: 14px; font: inherit; font-size: 15px; font-weight: 580; cursor: pointer; }
.pay-modal-btn:active { opacity: 0.85; }
.pay-modal-fine { color: var(--faint); font-size: 11px; text-align: center; margin: 14px 0 0; }

@media (max-width: 720px) {
  .pay-nav { padding: 15px 18px; }
  .pay-nav-links { gap: 16px; }
  .pay-nav-links a { display: none; }
  .pay-wrap { padding: 0 18px 90px; }
  .pay-stat-grid { grid-template-columns: 1fr 1fr; gap: 22px 18px; }
  .pay-row-head { flex-direction: column; gap: 10px; align-items: stretch; }
  .pay-row-nums { gap: 0; justify-content: space-between; padding-left: 39px; }
  .pay-num { text-align: left; }
  .pay-bill-count { min-width: 96px; }
}
`}</style>
  )
}
