// Types for the /sf-payroll explorer. Single year only (2025 Calendar) — the
// name field is NOT a stable person id, so there is no cross-year tracking.

export interface Employee {
  name: string
  nameLower: string // precomputed for fast search
  job: string
  department: string
  org: string
  union: string
  base: number // base salaries
  ot: number // overtime
  other: number // other_salaries
  totalSalary: number // base + ot + other
  totalComp: number // total_compensation (incl. benefits)
  hours: number // total PAID hours (NOT overtime hours — that field does not exist)
  otPct: number | null // ot / base, only when base >= floor ($50k)
}

export interface LeaderCard {
  name: string
  job: string
  department: string
  union: string
  base: number
  ot: number
  other: number
  totalSalary: number
  totalComp: number
  hours: number
  otPct: number | null
}

export interface DeptAgg {
  department: string
  employees: number
  totalOT: number
  totalComp: number
  totalBase: number
}

export interface Stats {
  year: number
  yearType: string
  governorSalary: number
  otPctBaseFloor: number
  hoursFlag: number
  employeeCount: number
  totalOT: number
  totalComp: number
  totalBase: number
  counts: {
    overGovernor: number
    otBeatBase: number
    over4000Hours: number
  }
  hero: LeaderCard | null
  leaderboards: {
    overtimeKings: LeaderCard[]
    highestTotalComp: LeaderCard[]
    outEarnedGovernor: LeaderCard[]
    otBeatBase: LeaderCard[]
  }
  departments: DeptAgg[]
}

export interface DataFile {
  year: number
  yearType: string
  governorSalary: number
  otPctBaseFloor: number
  hoursFlag: number
  columns: string[]
  dicts: { job: string[]; department: string[]; org: string[]; union: string[] }
  rows: (string | number)[][]
}

export type SortKey = "totalComp" | "ot" | "otPct" | "hours" | "base"
