// Formatters + benchmark-tag computation for /sf-payroll.

import type { Employee, LeaderCard, Stats } from "./types"

// Whole-dollar currency, e.g. $487,288 (negatives shown as -$1,234).
export function usd(n: number): string {
  const neg = n < 0
  const s = "$" + Math.abs(Math.round(n)).toLocaleString("en-US")
  return neg ? "-" + s : s
}

// Compact currency for big headline numbers, e.g. $482M, $1.2M, $827K.
export function usdCompact(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? "-" : ""
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(abs >= 1e10 ? 0 : 1)}B`
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(abs >= 1e8 ? 0 : 1)}M`
  if (abs >= 1e3) return `${sign}$${Math.round(abs / 1e3)}K`
  return `${sign}$${Math.round(abs)}`
}

// OT-as-%-of-base, e.g. 0.227 -> "227%".
export function pct(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—"
  return `${Math.round(n * 100)}%`
}

export function hoursLabel(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

export interface Tag {
  label: string
  tone: "ot" | "gov" | "hours"
}

// Returns only the benchmark facts that actually apply to this person — written
// as a quiet inline meta line, not loud pills.
export function benchmarkTags(e: Employee | LeaderCard, stats: Stats): Tag[] {
  const tags: Tag[] = []
  if (e.ot > e.base && e.base > 0) {
    tags.push({ label: `+${usd(e.ot - e.base)} OT over salary`, tone: "ot" })
  }
  if (e.totalComp > stats.governorSalary) {
    tags.push({ label: `out-earned the Governor`, tone: "gov" })
  }
  if (e.hours > stats.hoursFlag) {
    tags.push({ label: `${hoursLabel(e.hours)} paid hrs`, tone: "hours" })
  }
  return tags
}
