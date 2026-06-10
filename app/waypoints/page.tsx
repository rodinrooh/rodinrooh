"use client"

import { useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import type { Point } from "./components/WaypointMap"

const WaypointMap = dynamic(() => import("./components/WaypointMap"), { ssr: false })

const ACCENT = "#e5484d"
type Row = [string, number, number, string]

const toPoint = (r: Row): Point => ({ id: r[0], lat: r[1], lon: r[2], st: r[3] })

export default function Waypoints() {
  const [points, setPoints] = useState<Point[]>([])
  const [byId, setById] = useState<Map<string, Point>>(new Map())
  const [ids, setIds] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Point | null>(null)

  useEffect(() => {
    fetch("/waypoints.json")
      .then((r) => r.json())
      .then((data) => {
        const pts = (data.rows as Row[]).map(toPoint)
        const map = new Map<string, Point>()
        const idList: string[] = []
        for (const p of pts) if (!map.has(p.id)) { map.set(p.id, p); idList.push(p.id) }
        idList.sort()
        setPoints(pts)
        setById(map)
        setIds(idList)
      })
  }, [])

  const q = useMemo(() => query.toUpperCase().replace(/[^A-Z]/g, ""), [query])
  const exact = q ? byId.get(q) || null : null

  const suggestions = useMemo(() => {
    if (!q || exact || q.length < 2) return []
    const out: string[] = []
    for (const id of ids) { if (id.startsWith(q)) { out.push(id); if (out.length >= 6) break } }
    return out
  }, [q, exact, ids])

  // Live: jump to an exact match as it's typed.
  useEffect(() => {
    if (exact) setSelected(exact)
  }, [exact])

  function onEnter() {
    if (exact) setSelected(exact)
    else if (suggestions[0]) {
      const p = byId.get(suggestions[0])!
      setQuery(p.id)
      setSelected(p)
    }
  }

  const loading = points.length === 0

  return (
    <main style={{ position: "fixed", inset: 0, background: "#eaeef2", color: "#111", fontFamily: '-apple-system, "SF Pro Text", BlinkMacSystemFont, "Helvetica Neue", sans-serif', overflow: "hidden" }}>
      {!loading && <WaypointMap points={points} selected={selected} onSelect={setSelected} />}

      {/* Search (top center) */}
      <div style={{ position: "absolute", top: 26, left: "50%", transform: "translateX(-50%)", width: "min(360px, calc(100% - 140px))", zIndex: 5 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            background: "#fff",
            border: "1px solid #e3e6eb",
            borderRadius: 999,
            padding: "13px 22px",
            boxShadow: "0 6px 22px rgba(20,30,50,.12)",
          }}
        >
          <input
            className="wp-input"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onEnter()}
            placeholder="search a name"
            spellCheck={false}
            style={{
              width: "100%",
              fontSize: 16,
              fontWeight: 500,
              letterSpacing: "-0.015em",
              textAlign: "center",
              border: "none",
              outline: "none",
              background: "transparent",
              color: "#111",
              caretColor: ACCENT,
              minWidth: 0,
            }}
          />
        </div>

        {!exact && q.length >= 1 && (
          <div style={{ marginTop: 12, textAlign: "center", fontSize: 14, color: "#5f6b7a" }}>
            No waypoint named <b style={{ color: "#111", fontWeight: 600 }}>{q}</b> yet.
            {suggestions.length > 0 && (
              <div style={{ marginTop: 6 }}>
                {suggestions.map((s, i) => (
                  <span key={s}>
                    {i > 0 && <span style={{ color: "#c3cad4" }}> · </span>}
                    <button
                      onClick={() => { setQuery(s); setSelected(byId.get(s)!) }}
                      style={{ border: "none", background: "none", padding: 0, color: ACCENT, cursor: "pointer", font: "inherit" }}
                    >
                      {s}
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Count bubble (top-right) */}
      <div
        style={{
          position: "absolute",
          top: 26,
          right: 26,
          zIndex: 5,
          display: "flex",
          alignItems: "baseline",
          gap: 7,
          background: "#fff",
          border: "1px solid #e3e6eb",
          borderRadius: 999,
          padding: "10px 18px",
          boxShadow: "0 6px 22px rgba(20,30,50,.12)",
        }}
      >
        <span style={{ fontSize: 18, fontWeight: 680, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>
          {(points.length || 69010).toLocaleString()}
        </span>
        <span style={{ fontSize: 13, color: "#8a93a3" }}>waypoints</span>
      </div>
    </main>
  )
}
