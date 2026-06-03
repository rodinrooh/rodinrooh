"use client"

import { useMemo, useRef, useState } from "react"
import { useWindowVirtualizer } from "@tanstack/react-virtual"
import type { Employee, SortKey, Stats } from "../lib/types"
import { filterAndSort, uniqueDepartments } from "../lib/data"
import EmployeeRow from "./EmployeeRow"

const SORTS: { key: SortKey; label: string }[] = [
  { key: "totalComp", label: "Total comp" },
  { key: "ot", label: "Overtime $" },
  { key: "otPct", label: "OT % of base" },
  { key: "hours", label: "Paid hours" },
  { key: "base", label: "Base salary" },
]

export default function Explorer({
  employees,
  stats,
  department,
  onDepartmentChange,
}: {
  employees: Employee[]
  stats: Stats
  department: string
  onDepartmentChange: (d: string) => void
}) {
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortKey>("ot")

  const departments = useMemo(() => uniqueDepartments(employees), [employees])
  const rows = useMemo(
    () => filterAndSort(employees, { query, department, sort }),
    [employees, query, department, sort]
  )

  const listRef = useRef<HTMLDivElement>(null)
  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => 132,
    overscan: 8,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  })

  const showRank = sort === "otPct" ? false : true

  return (
    <section className="pay-explorer" id="explorer">
      <div className="pay-section-head">
        <h2 className="pay-h2">The explorer</h2>
        <p className="pay-section-sub">
          All {stats.employeeCount.toLocaleString()} city employees. Search, sort, filter — exact, single-year.
        </p>
      </div>

      <div className="pay-controls">
        <input
          className="pay-search"
          type="text"
          inputMode="search"
          placeholder="Search by name — try Lurie, Harrell, the Police Chief…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="pay-select"
          value={department}
          onChange={(e) => onDepartmentChange(e.target.value)}
        >
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <div className="pay-sortrow">
        <span className="pay-sortlabel">Sort by</span>
        {SORTS.map((s) => (
          <button
            key={s.key}
            className={`pay-sortbtn${sort === s.key ? " is-active" : ""}`}
            onClick={() => setSort(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="pay-resultcount">
        Showing {rows.length.toLocaleString()}
        {rows.length !== stats.employeeCount ? ` of ${stats.employeeCount.toLocaleString()}` : ""}
        {query ? ` matching “${query}”` : ""}
        {department !== "All departments" ? ` in ${department}` : ""}
      </div>

      <div ref={listRef} style={{ position: "relative", height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((vi) => {
          const e = rows[vi.index]
          return (
            <div
              key={vi.key}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vi.start - virtualizer.options.scrollMargin}px)`,
              }}
            >
              <EmployeeRow e={e} stats={stats} rank={showRank ? vi.index + 1 : undefined} />
            </div>
          )
        })}
        {rows.length === 0 && (
          <div className="pay-empty">No one matches that. Try a different name or department.</div>
        )}
      </div>
    </section>
  )
}
