"use client"

import { useMemo, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { Employee, SortKey, Stats } from "../lib/types"
import { filterAndSort, uniqueDepartments } from "../lib/data"
import EmployeeRow from "./EmployeeRow"

const SORTS: { key: SortKey; label: string }[] = [
  { key: "ot", label: "Overtime" },
  { key: "otPct", label: "OT % of base" },
  { key: "totalComp", label: "Total comp" },
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

  // Self-contained scroll container — the list virtualizes against THIS box, not
  // the window, so 42k rows never hijack the page scroll.
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 92,
    overscan: 10,
  })

  const showRank = sort !== "otPct"

  return (
    <section className="pay-explorer" id="explorer">
      <div className="pay-section-head">
        <h2 className="pay-h2">Look up anyone</h2>
        <p className="pay-section-sub">
          All {stats.employeeCount.toLocaleString()} city employees, 2025. Search a name, sort, filter by department.
        </p>
      </div>

      <div className="pay-controls">
        <input
          className="pay-search"
          type="text"
          inputMode="search"
          placeholder="Search a name — Lurie, the Police Chief, your neighbor…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="pay-select" value={department} onChange={(e) => onDepartmentChange(e.target.value)}>
          {departments.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <div className="pay-sortrow">
        <span className="pay-sortlabel">Sort</span>
        {SORTS.map((s) => (
          <button
            key={s.key}
            className={`pay-sortbtn${sort === s.key ? " is-active" : ""}`}
            onClick={() => setSort(s.key)}
          >
            {s.label}
          </button>
        ))}
        <span className="pay-resultcount">
          {rows.length.toLocaleString()}
          {rows.length !== stats.employeeCount ? ` of ${stats.employeeCount.toLocaleString()}` : ""}
        </span>
      </div>

      <div className="pay-scroll" ref={scrollRef}>
        {rows.length === 0 ? (
          <div className="pay-empty">No match. Try a different name or department.</div>
        ) : (
          <div style={{ position: "relative", height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const e = rows[vi.index]
              return (
                <div
                  key={vi.key}
                  data-index={vi.index}
                  ref={virtualizer.measureElement}
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vi.start}px)` }}
                >
                  <EmployeeRow e={e} stats={stats} rank={showRank ? vi.index + 1 : undefined} />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
