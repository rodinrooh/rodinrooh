"use client"

import { useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import type { Point } from "./components/WaypointMap"

const WaypointMap = dynamic(() => import("./components/WaypointMap"), { ssr: false })

const ACCENT = "#e5484d"
type Row = [string, number, number, string]

const STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts",
  MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",
  NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "Washington, D.C.", PR: "Puerto Rico", VI: "U.S. Virgin Islands", GU: "Guam",
  OG: "the Gulf of Mexico",
}

const toPoint = (r: Row): Point => ({ id: r[0], lat: r[1], lon: r[2], st: r[3] })
function coords(lat: number, lon: number) {
  return `${Math.abs(lat).toFixed(3)}°${lat >= 0 ? "N" : "S"}  ${Math.abs(lon).toFixed(3)}°${lon >= 0 ? "E" : "W"}`
}
const placeLine = (st: string) => (STATES[st] ? `over ${STATES[st]}` : "out past the coast")

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
    <main style={{ position: "fixed", inset: 0, background: "#e7eef6", color: "#111", fontFamily: '-apple-system, "SF Pro Text", BlinkMacSystemFont, "Helvetica Neue", sans-serif', overflow: "hidden" }}>
      {!loading && <WaypointMap points={points} selected={selected} onSelect={setSelected} />}

      {/* Title + search (top-left) */}
      <div style={{ position: "absolute", top: 32, left: 32, width: "min(340px, calc(100% - 48px))", zIndex: 5 }}>
        <h1 style={{ fontSize: 30, fontWeight: 680, letterSpacing: "-0.035em", lineHeight: 1.05, margin: "0 0 16px" }}>
          Every name in the sky
        </h1>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            background: "#fff",
            border: "1px solid #e3e6eb",
            borderRadius: 14,
            padding: "12px 16px",
            boxShadow: "0 4px 16px rgba(20,30,50,.08)",
          }}
        >
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onEnter()}
            placeholder="Search a name"
            spellCheck={false}
            autoCapitalize="characters"
            style={{
              width: "100%",
              fontSize: 17,
              fontWeight: 500,
              letterSpacing: "-0.01em",
              textTransform: "uppercase",
              border: "none",
              outline: "none",
              background: "transparent",
              color: "#111",
              caretColor: ACCENT,
              minWidth: 0,
            }}
          />
        </div>

        {(exact || q.length >= 1) && (
          <div style={{ marginTop: 14, paddingLeft: 2 }}>
            {exact ? (
              <>
                <div style={{ fontSize: 15.5, lineHeight: 1.4 }}>
                  <b style={{ color: ACCENT, fontWeight: 600 }}>{exact.id}</b> is real — {placeLine(exact.st)}.
                </div>
                <div style={{ fontSize: 12.5, color: "#8a93a3", marginTop: 5, fontVariantNumeric: "tabular-nums" }}>
                  {coords(exact.lat, exact.lon)}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 14.5, color: "#5f6b7a" }}>
                No waypoint named <b style={{ color: "#111", fontWeight: 600 }}>{q}</b> yet.
                {suggestions.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    {suggestions.map((s, i) => (
                      <span key={s} style={{ fontSize: 14 }}>
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
        )}
      </div>

      {/* Count bubble (top-right) */}
      <div
        style={{
          position: "absolute",
          top: 32,
          right: 32,
          zIndex: 5,
          display: "flex",
          alignItems: "baseline",
          gap: 7,
          background: "#fff",
          border: "1px solid #e3e6eb",
          borderRadius: 999,
          padding: "9px 17px",
          boxShadow: "0 4px 16px rgba(20,30,50,.08)",
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
