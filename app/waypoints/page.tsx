"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import type { Point } from "./components/WaypointMap"

const WaypointMap = dynamic(() => import("./components/WaypointMap"), { ssr: false })

const ACCENT = "#ff9f1c"

type Row = [string, number, number, string]
type WeirdItem = Point & { caption?: string }
type StateStat = { st: string; n: number }

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
}

const toPoint = (r: Row): Point => ({ id: r[0], lat: r[1], lon: r[2], st: r[3] })

function coords(lat: number, lon: number) {
  const la = `${Math.abs(lat).toFixed(3)}°${lat >= 0 ? "N" : "S"}`
  const lo = `${Math.abs(lon).toFixed(3)}°${lon >= 0 ? "E" : "W"}`
  return `${la}  ${lo}`
}
const placeLine = (st: string) => (STATES[st] ? `over ${STATES[st]}` : "out past the coast")

export default function Waypoints() {
  const [points, setPoints] = useState<Point[]>([])
  const [byId, setById] = useState<Map<string, Point>>(new Map())
  const [ids, setIds] = useState<string[]>([])
  const [wordSet, setWordSet] = useState<Set<string>>(new Set())
  const [curated, setCurated] = useState<WeirdItem[]>([])
  const [words, setWords] = useState<Point[]>([])
  const [stats, setStats] = useState<{ total: number; realWords: number; byState: StateStat[] } | null>(null)

  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Point | null>(null)
  const [highlightWords, setHighlightWords] = useState(false)
  const [filter, setFilter] = useState("")
  const topRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    Promise.all([
      fetch("/waypoints.json").then((r) => r.json()),
      fetch("/waypoints-weird.json").then((r) => r.json()),
      fetch("/waypoints-stats.json").then((r) => r.json()),
    ]).then(([data, weird, st]) => {
      const pts = (data.rows as Row[]).map(toPoint)
      const map = new Map<string, Point>()
      const idList: string[] = []
      for (const p of pts) if (!map.has(p.id)) { map.set(p.id, p); idList.push(p.id) }
      idList.sort()
      const wpts = (weird.words as Row[]).map(toPoint)
      setPoints(pts)
      setById(map)
      setIds(idList)
      setWordSet(new Set(wpts.map((p) => p.id)))
      setCurated(weird.curated as WeirdItem[])
      setWords(wpts)
      setStats(st)
    })
  }, [])

  const q = useMemo(() => query.toUpperCase().replace(/[^A-Z]/g, ""), [query])
  const exact = q ? byId.get(q) || null : null

  const suggestions = useMemo(() => {
    if (!q || exact || q.length < 2) return []
    const out: string[] = []
    for (const id of ids) {
      if (id.startsWith(q)) { out.push(id); if (out.length >= 6) break }
    }
    return out
  }, [q, exact, ids])

  useEffect(() => {
    if (exact) setSelected(exact)
  }, [exact])

  function choose(p: Point) {
    setQuery(p.id)
    setSelected(p)
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const filteredWords = useMemo(() => {
    const f = filter.toUpperCase().replace(/[^A-Z]/g, "")
    return f ? words.filter((w) => w.id.includes(f)) : words
  }, [filter, words])

  const loading = points.length === 0
  const maxState = stats?.byState[0]?.n || 1

  return (
    <main style={{ background: "#fff", color: "#1a1a1a", minHeight: "100vh", fontFamily: '-apple-system, "SF Pro Text", BlinkMacSystemFont, "Helvetica Neue", sans-serif' }}>
      <div ref={topRef} />

      {/* Map */}
      <section style={{ position: "relative", height: "94vh", minHeight: 560, overflow: "hidden" }}>
        {!loading && (
          <WaypointMap
            points={points}
            wordSet={wordSet}
            selected={selected}
            highlightWords={highlightWords}
            onSelect={(p) => setSelected(p)}
          />
        )}

        {/* soft scrim so floating chrome stays crisp over the map */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 220, background: "linear-gradient(180deg,#fff 18%,rgba(255,255,255,0))", zIndex: 1, pointerEvents: "none" }} />

        {/* Title + search */}
        <div className="wp-search" style={{ position: "absolute", top: 40, left: 40, width: "min(380px, calc(100% - 56px))", zIndex: 5 }}>
          <h1 style={{ fontSize: 34, fontWeight: 680, letterSpacing: -1, lineHeight: 1.04, margin: "0 0 10px" }}>
            Every name in the sky
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.55, color: "#666", margin: "0 0 22px", maxWidth: 340 }}>
            {stats ? stats.total.toLocaleString() : "69,010"} waypoints hover invisibly over America —
            each a real name planes fly between. Search for one.
          </p>

          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a name"
            spellCheck={false}
            autoCapitalize="characters"
            style={{ width: "100%", maxWidth: 320, fontSize: 22, fontWeight: 500, letterSpacing: ".01em", textTransform: "uppercase", padding: "6px 0", border: "none", borderBottom: "1.5px solid #111", outline: "none", background: "transparent", color: "#111", caretColor: ACCENT }}
          />

          {!loading && (exact || q.length >= 1) && (
            <div style={{ marginTop: 16, maxWidth: 320 }}>
              {exact ? (
                <>
                  <div style={{ fontSize: 16, lineHeight: 1.4 }}>
                    <b style={{ color: ACCENT, fontWeight: 600 }}>{exact.id}</b> is real — {placeLine(exact.st)}.
                  </div>
                  <div style={{ fontSize: 12.5, color: "#999", marginTop: 5, fontVariantNumeric: "tabular-nums" }}>
                    {coords(exact.lat, exact.lon)}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 15, color: "#666" }}>
                  No waypoint named <b style={{ color: "#111", fontWeight: 600 }}>{q}</b> yet.
                  {suggestions.length > 0 && (
                    <div style={{ marginTop: 7 }}>
                      {suggestions.map((s, i) => (
                        <span key={s} style={{ fontSize: 14 }}>
                          {i > 0 && <span style={{ color: "#ccc" }}> · </span>}
                          <button onClick={() => choose(byId.get(s)!)} style={{ border: "none", background: "none", padding: 0, color: ACCENT, cursor: "pointer", font: "inherit" }}>{s}</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* real-words toggle */}
          <button
            onClick={() => setHighlightWords((v) => !v)}
            style={{ marginTop: 22, display: "inline-flex", alignItems: "center", gap: 9, cursor: "pointer", background: "transparent", border: `1px solid ${highlightWords ? ACCENT : "#dcdcdc"}`, color: highlightWords ? ACCENT : "#555", borderRadius: 999, padding: "8px 14px", fontSize: 13, fontWeight: 500 }}
          >
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: highlightWords ? ACCENT : "#cfcfcf" }} />
            Highlight the {(stats?.realWords ?? 4895).toLocaleString()} real words
          </button>
        </div>

        {/* Stat */}
        <div className="wp-hide-sm" style={{ position: "absolute", top: 42, right: 44, textAlign: "right", zIndex: 5, pointerEvents: "none" }}>
          <div style={{ fontSize: 34, fontWeight: 680, letterSpacing: "-.02em", color: "#111", fontVariantNumeric: "tabular-nums" }}>
            {stats ? stats.total.toLocaleString() : "—"}
          </div>
          <div style={{ fontSize: 12.5, color: "#999", marginTop: 2 }}>named waypoints</div>
        </div>

        {/* hint */}
        <div style={{ position: "absolute", bottom: 18, right: 28, fontSize: 12, color: "#b5b5b5", zIndex: 5, pointerEvents: "none" }}>
          Drag to explore · click a dot
        </div>
      </section>

      {/* Where the names cluster */}
      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "72px 40px 8px" }}>
        <SectionLabel>Where the names cluster</SectionLabel>
        <p style={{ fontSize: 15, color: "#666", margin: "12px 0 28px", lineHeight: 1.6, maxWidth: 540 }}>
          The density isn&apos;t random — it traces the busiest airspace in the country. Here&apos;s
          where the most named waypoints hang.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 11, maxWidth: 720 }}>
          {(stats?.byState || []).slice(0, 12).map((s) => (
            <div key={s.st} style={{ display: "grid", gridTemplateColumns: "140px 1fr 56px", alignItems: "center", gap: 16 }}>
              <span style={{ fontSize: 14, color: "#333" }}>{STATES[s.st] || s.st}</span>
              <span style={{ height: 6, background: "#f0f0f0", borderRadius: 3, overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", width: `${(s.n / maxState) * 100}%`, background: ACCENT, borderRadius: 3 }} />
              </span>
              <span style={{ fontSize: 13, color: "#999", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {s.n.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* The weird ones */}
      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "60px 40px 8px" }}>
        <SectionLabel>The weird ones</SectionLabel>
        <p style={{ fontSize: 15, color: "#666", margin: "12px 0 22px", lineHeight: 1.6, maxWidth: 540 }}>
          Controllers name these, and they have a sense of humor. Click any to find it on the map.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", columnGap: 40 }}>
          {curated.map((c) => (
            <button key={c.id} onClick={() => choose(c)} style={{ display: "flex", gap: 16, alignItems: "baseline", textAlign: "left", padding: "14px 0", border: "none", borderBottom: "1px solid #eee", background: "transparent", cursor: "pointer", width: "100%" }}>
              <span style={{ font: "600 14px/1 ui-monospace, SFMono-Regular, Menlo, monospace", letterSpacing: ".06em", color: ACCENT, minWidth: 60 }}>{c.id}</span>
              <span style={{ fontSize: 14, color: "#555", lineHeight: 1.5 }}>{c.caption}</span>
            </button>
          ))}
        </div>
      </section>

      {/* All the real words */}
      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "52px 40px 120px" }}>
        <SectionLabel>
          Real words in the sky <span style={{ color: "#bbb", fontWeight: 400 }}>· {words.length.toLocaleString()}</span>
        </SectionLabel>
        <p style={{ fontSize: 15, color: "#666", margin: "12px 0 20px", lineHeight: 1.6, maxWidth: 540 }}>
          Every plain English word that&apos;s also a real waypoint. All of them.
        </p>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter"
          spellCheck={false}
          style={{ marginBottom: 24, width: "min(220px,100%)", fontSize: 14, textTransform: "uppercase", padding: "8px 0", border: "none", borderBottom: "1px solid #ddd", outline: "none", background: "transparent", color: "#111", caretColor: ACCENT }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: "11px 20px" }}>
          {filteredWords.map((w) => (
            <button key={w.id} onClick={() => choose(w)} style={{ font: "500 13px/1 ui-monospace, SFMono-Regular, Menlo, monospace", letterSpacing: ".04em", color: "#555", border: "none", background: "none", padding: 0, cursor: "pointer" }} className="wp-word">
              {w.id}
            </button>
          ))}
          {filteredWords.length === 0 && <span style={{ fontSize: 14, color: "#bbb" }}>nothing matches that.</span>}
        </div>
      </section>
    </main>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 22, fontWeight: 640, letterSpacing: -0.5, color: "#111", margin: 0 }}>
      {children}
    </h2>
  )
}
