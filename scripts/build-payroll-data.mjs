// Build-time data pipeline for /sf-payroll.
//
// Downloads DataSF "Employee Compensation" (Socrata dataset 88g8-5mnd) ONCE,
// trims + dictionary-encodes it into a compact static JSON shipped in /public,
// and pre-computes the headline stats + curated leaderboards.
//
// Run manually (re-run annually when DataSF publishes a new complete year):
//   node scripts/build-payroll-data.mjs
//
// IMPORTANT data rules baked in here (see the dataset gotchas):
//  - Filter year_type='Calendar' AND the latest complete year. Every person also
//    appears under a 'Fiscal' row; without this filter you double everyone.
//  - `total_salary` = salaries(base) + overtime + other_salaries. It INCLUDES
//    overtime. So "more in OT than salary" compares overtime vs BASE salaries.
//  - There is NO overtime-hours field. We only ever expose `hours` (total paid).
//  - `employee_identifier` (the name) is a text string, NOT a stable person id
//    (~2,200 names collide). Single-year only — no cross-year tracking.
//  - A few rows carry negative values (payroll adjustments). Handled gracefully.

import { writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = join(__dirname, "..", "public")

// ---- config ---------------------------------------------------------------
const DATASET = "88g8-5mnd"
const YEAR = "2025" // latest complete Calendar year, verified against the source
const YEAR_TYPE = "Calendar"
const PAGE = 50000 // dataset is ~42.5k rows; one page is enough, but we loop to be safe

const GOVERNOR_SALARY = 242295 // Governor of California base salary benchmark
const OT_PCT_BASE_FLOOR = 50000 // OT-%-of-base is only meaningful at base >= $50k
const HOURS_FLAG = 4000 // paid-hours flag threshold

const SELECT = [
  "employee_identifier",
  "job",
  "department",
  "organization_group",
  "`union`", // SoQL reserved word — must be backtick-quoted
  "salaries",
  "overtime",
  "other_salaries",
  "total_salary",
  "total_compensation",
  "hours",
].join(",")

// ---- fetch -----------------------------------------------------------------
async function fetchAll() {
  const base = `https://data.sfgov.org/resource/${DATASET}.json`
  const where = `year='${YEAR}' AND year_type='${YEAR_TYPE}'`
  const rows = []
  for (let offset = 0; ; offset += PAGE) {
    const url =
      `${base}?$select=${encodeURIComponent(SELECT)}` +
      `&$where=${encodeURIComponent(where)}` +
      `&$limit=${PAGE}&$offset=${offset}` +
      `&$order=overtime DESC`.replace(/ /g, "%20")
    const token = process.env.DATASF_APP_TOKEN
    const res = await fetch(url, token ? { headers: { "X-App-Token": token } } : undefined)
    if (!res.ok) throw new Error(`Socrata ${res.status}: ${await res.text()}`)
    const batch = await res.json()
    rows.push(...batch)
    console.log(`  fetched ${rows.length} rows…`)
    if (batch.length < PAGE) break
  }
  return rows
}

// ---- helpers ---------------------------------------------------------------
const num = (v) => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}
const r0 = (n) => Math.round(n) // whole dollars / whole hours for the shipped payload

function makeDict() {
  const list = []
  const index = new Map()
  return {
    id(s) {
      const key = s ?? ""
      if (index.has(key)) return index.get(key)
      const i = list.length
      index.set(key, i)
      list.push(key)
      return i
    },
    list,
  }
}

// ---- main ------------------------------------------------------------------
console.log(`Fetching DataSF ${DATASET} — ${YEAR_TYPE} ${YEAR}…`)
const raw = await fetchAll()
console.log(`Total rows: ${raw.length}`)

const jobs = makeDict()
const depts = makeDict()
const orgs = makeDict()
const unions = makeDict()

// Normalize into typed records (raw, unrounded — stats computed from these).
const people = raw.map((r) => {
  const base = num(r.salaries)
  const ot = num(r.overtime)
  const other = num(r.other_salaries)
  const totalComp = num(r.total_compensation)
  const totalSalary = num(r.total_salary)
  const hours = num(r.hours)
  return {
    name: (r.employee_identifier ?? "").trim(),
    jobIdx: jobs.id(r.job),
    deptIdx: depts.id(r.department),
    orgIdx: orgs.id(r.organization_group),
    unionIdx: unions.id(r.union),
    base,
    ot,
    other,
    totalSalary,
    totalComp,
    hours,
    // OT as a share of BASE salary; only meaningful at base >= floor.
    otPct: base >= OT_PCT_BASE_FLOOR && base > 0 ? ot / base : null,
  }
})

// ---- compact data file -----------------------------------------------------
// Row layout (arrays, no repeated keys): see `columns` below.
const columns = ["name", "jobIdx", "deptIdx", "orgIdx", "unionIdx", "base", "ot", "other", "totalComp", "hours"]
const rows = people.map((p) => [
  p.name,
  p.jobIdx,
  p.deptIdx,
  p.orgIdx,
  p.unionIdx,
  r0(p.base),
  r0(p.ot),
  r0(p.other),
  r0(p.totalComp),
  r0(p.hours),
])

const dataFile = {
  year: Number(YEAR),
  yearType: YEAR_TYPE,
  governorSalary: GOVERNOR_SALARY,
  otPctBaseFloor: OT_PCT_BASE_FLOOR,
  hoursFlag: HOURS_FLAG,
  columns,
  dicts: { job: jobs.list, department: depts.list, org: orgs.list, union: unions.list },
  rows,
}

// ---- stats + leaderboards (from raw values) --------------------------------
const totalOT = people.reduce((s, p) => s + p.ot, 0)
const totalComp = people.reduce((s, p) => s + p.totalComp, 0)
const totalBase = people.reduce((s, p) => s + p.base, 0)

const overGovernor = people.filter((p) => p.totalComp > GOVERNOR_SALARY)
const otBeatBase = people.filter((p) => p.ot > p.base && p.base > 0)
const over4000 = people.filter((p) => p.hours > HOURS_FLAG)
const otEligible = people.filter((p) => p.otPct !== null)

// Trim a person down to what a leaderboard card needs.
const card = (p) => ({
  name: p.name,
  job: jobs.list[p.jobIdx],
  department: depts.list[p.deptIdx],
  union: unions.list[p.unionIdx],
  base: r0(p.base),
  ot: r0(p.ot),
  other: r0(p.other),
  totalSalary: r0(p.totalSalary),
  totalComp: r0(p.totalComp),
  hours: r0(p.hours),
  otPct: p.otPct,
})

const topBy = (arr, key, n = 50) => [...arr].sort((a, b) => b[key] - a[key]).slice(0, n).map(card)

const leaderboards = {
  overtimeKings: [...otEligible].sort((a, b) => b.otPct - a.otPct).slice(0, 50).map(card),
  highestTotalComp: topBy(people, "totalComp", 50),
  outEarnedGovernor: topBy(overGovernor, "totalComp", 50),
  otBeatBase: [...otBeatBase].sort((a, b) => b.ot - b.base - (a.ot - a.base)).slice(0, 50).map(card),
}

// Department rollups (Police / Sheriff / Fire dominate citywide OT).
const deptMap = new Map()
for (const p of people) {
  const d = depts.list[p.deptIdx] || "(none)"
  let agg = deptMap.get(d)
  if (!agg) {
    agg = { department: d, employees: 0, totalOT: 0, totalComp: 0, totalBase: 0 }
    deptMap.set(d, agg)
  }
  agg.employees++
  agg.totalOT += p.ot
  agg.totalComp += p.totalComp
  agg.totalBase += p.base
}
const departments = [...deptMap.values()]
  .map((d) => ({
    department: d.department,
    employees: d.employees,
    totalOT: r0(d.totalOT),
    totalComp: r0(d.totalComp),
    totalBase: r0(d.totalBase),
  }))
  .sort((a, b) => b.totalOT - a.totalOT)

const statsFile = {
  year: Number(YEAR),
  yearType: YEAR_TYPE,
  governorSalary: GOVERNOR_SALARY,
  otPctBaseFloor: OT_PCT_BASE_FLOOR,
  hoursFlag: HOURS_FLAG,
  employeeCount: people.length,
  totalOT: r0(totalOT),
  totalComp: r0(totalComp),
  totalBase: r0(totalBase),
  counts: {
    overGovernor: overGovernor.length,
    otBeatBase: otBeatBase.length,
    over4000Hours: over4000.length,
  },
  hero: leaderboards.highestTotalComp.length ? topBy(people, "ot", 1)[0] : null,
  leaderboards,
  departments,
}

// ---- write -----------------------------------------------------------------
const dataPath = join(PUBLIC_DIR, "sf-payroll-data.json")
const statsPath = join(PUBLIC_DIR, "sf-payroll-stats.json")
writeFileSync(dataPath, JSON.stringify(dataFile))
writeFileSync(statsPath, JSON.stringify(statsFile))

const mb = (p) => (Buffer.byteLength(JSON.stringify(p)) / 1e6).toFixed(2)
console.log("\n=== SUMMARY ===")
console.log(`employeeCount   : ${statsFile.employeeCount}`)
console.log(`totalOT         : $${totalOT.toLocaleString()}`)
console.log(`overGovernor    : ${statsFile.counts.overGovernor}`)
console.log(`otBeatBase      : ${statsFile.counts.otBeatBase}`)
console.log(`over4000Hours   : ${statsFile.counts.over4000Hours}`)
console.log(`hero            : ${statsFile.hero?.name} — ${statsFile.hero?.job} ($${statsFile.hero?.ot.toLocaleString()} OT)`)
console.log(`data.json       : ${mb(dataFile)} MB`)
console.log(`stats.json      : ${mb(statsFile)} MB`)
console.log(`\nWrote ${dataPath}\nWrote ${statsPath}`)
