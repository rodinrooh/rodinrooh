// Client-side loader for the pre-built static payroll data.
// Both files are generated once by scripts/build-payroll-data.mjs and shipped
// in /public. We fetch + decode + memoize; all sort/filter/search is in memory.

import type { DataFile, Employee, SortKey, Stats } from "./types"

let employeesPromise: Promise<Employee[]> | null = null
let statsPromise: Promise<Stats> | null = null

export function loadStats(): Promise<Stats> {
  if (!statsPromise) {
    statsPromise = fetch("/sf-payroll-stats.json").then((r) => {
      if (!r.ok) throw new Error(`stats ${r.status}`)
      return r.json()
    })
  }
  return statsPromise
}

export function loadEmployees(): Promise<Employee[]> {
  if (!employeesPromise) {
    employeesPromise = fetch("/sf-payroll-data.json")
      .then((r) => {
        if (!r.ok) throw new Error(`data ${r.status}`)
        return r.json() as Promise<DataFile>
      })
      .then(decode)
  }
  return employeesPromise
}

function decode(d: DataFile): Employee[] {
  const { job, department, org, union } = d.dicts
  const floor = d.otPctBaseFloor
  // Row layout matches `columns` in the builder:
  // [name, jobIdx, deptIdx, orgIdx, unionIdx, base, ot, other, totalComp, hours]
  return d.rows.map((row) => {
    const name = row[0] as string
    const base = row[5] as number
    const ot = row[6] as number
    const other = row[7] as number
    const totalComp = row[8] as number
    const hours = row[9] as number
    return {
      name,
      nameLower: name.toLowerCase(),
      job: job[row[1] as number] || "",
      department: department[row[2] as number] || "",
      org: org[row[3] as number] || "",
      union: union[row[4] as number] || "",
      base,
      ot,
      other,
      totalSalary: base + ot + other,
      totalComp,
      hours,
      otPct: base >= floor && base > 0 ? ot / base : null,
    }
  })
}

// ---- in-memory query helpers ----------------------------------------------

export function filterAndSort(
  all: Employee[],
  opts: { query: string; department: string; sort: SortKey }
): Employee[] {
  const q = opts.query.trim().toLowerCase()
  let out = all
  if (opts.department && opts.department !== "All departments") {
    out = out.filter((e) => e.department === opts.department)
  }
  if (q) {
    out = out.filter((e) => e.nameLower.includes(q))
  }
  const key = opts.sort
  // otPct can be null — push nulls to the bottom. Everything else is numeric desc.
  return [...out].sort((a, b) => {
    const av = a[key]
    const bv = b[key]
    if (av === null && bv === null) return 0
    if (av === null) return 1
    if (bv === null) return -1
    return (bv as number) - (av as number)
  })
}

export function uniqueDepartments(all: Employee[]): string[] {
  const set = new Set<string>()
  for (const e of all) if (e.department) set.add(e.department)
  return ["All departments", ...[...set].sort()]
}

// How many employees out-earn `salary` (by total compensation), and the rank a
// person at that salary would land at. Used by the personal salary ranker.
export function rankBySalary(all: Employee[], salary: number): { outEarn: number; rank: number; total: number } {
  let outEarn = 0
  for (const e of all) if (e.totalComp > salary) outEarn++
  return { outEarn, rank: outEarn + 1, total: all.length }
}
