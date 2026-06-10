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
    <main style={{ background: "#070a12", color: "#e7ecf7", minHeight: "100vh", fontFamily: '-apple-system, "SF Pro Text", BlinkMacSystemFont, sans-serif' }}>
      <div ref={topRef} />

      {/* Map hero */}
      <section style={{ position: "relative", height: "100vh", minHeight: 560, overflow: "hidden" }}>
        {!loading && (
          <WaypointMap
            points={points}
            wordSet={wordSet}
            selected={selected}
            highlightWords={highlightWords}
            onSelect={(p) => setSelected(p)}
          />
        )}

        {/* Title + search */}
        <div className="wp-search" style={{ position: "absolute", top: 28, left: 28, width: "min(360px, calc(100% - 44px))", zIndex: 5 }}>
          <h1 style={{ fontSize: 27, fontWeight: 600, letterSpacing: -0.6, lineHeight: 1.1, margin: "0 0 6px", textShadow: "0 1px 18px rgba(0,0,0,.85)" }}>
            Every name in the sky
          </h1>
          <p style={{ fontSize: 13.5, lineHeight: 1.5, color: "#aab4cc", margin: "0 0 16px", textShadow: "0 1px 14px rgba(0,0,0,.9)" }}>
            {stats ? stats.total.toLocaleString() : "69,010"} waypoints hover invisibly over America.
            Each one is a real name planes fly between.
          </p>

          <div style={{ background: "rgba(16,20,30,.7)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 13, padding: "12px 14px", boxShadow: "0 8px 30px rgba(0,0,0,.4)" }}>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a name"
              spellCheck={false}
              autoCapitalize="characters"
              style={{ width: "100%", fontSize: 18, fontWeight: 500, letterSpacing: ".02em", textTransform: "uppercase", border: "none", outline: "none", background: "transparent", color: "#fff", caretColor: ACCENT, minWidth: 0 }}
            />

            {!loading && (exact || q.length >= 1) && (
              <div style={{ marginTop: 11, paddingTop: 11, borderTop: "1px solid rgba(255,255,255,.09)" }}>
                {exact ? (
                  <>
                    <div style={{ fontSize: 14, lineHeight: 1.45, color: "#e7ecf7" }}>
                      <b style={{ color: ACCENT, fontWeight: 600 }}>{exact.id}</b> is real — {placeLine(exact.st)}.
                    </div>
                    <div style={{ fontSize: 12, color: "#7e8aa6", marginTop: 5, fontVariantNumeric: "tabular-nums" }}>
                      {coords(exact.lat, exact.lon)}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 13.5, color: "#aab4cc" }}>
                    No waypoint named <b style={{ color: "#e7ecf7", fontWeight: 600 }}>{q}</b> yet.
                    {suggestions.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        {suggestions.map((s, i) => (
                          <span key={s} style={{ fontSize: 13 }}>
                            {i > 0 && <span style={{ color: "#3f4866" }}> · </span>}
                            <button onClick={() => choose(byId.get(s)!)} style={{ border: "none", background: "none", padding: 0, color: ACCENT, cursor: "pointer", font: "inherit" }}>{s}</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* real-words toggle */}
          <button
            onClick={() => setHighlightWords((v) => !v)}
            style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 9, cursor: "pointer", background: highlightWords ? "rgba(255,159,28,.15)" : "rgba(16,20,30,.6)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", border: `1px solid ${highlightWords ? "rgba(255,159,28,.45)" : "rgba(255,255,255,.1)"}`, color: highlightWords ? "#ffc46b" : "#aab4cc", borderRadius: 999, padding: "8px 14px", fontSize: 13, fontWeight: 500 }}
          >
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: highlightWords ? ACCENT : "#414b69", boxShadow: highlightWords ? `0 0 8px ${ACCENT}` : "none" }} />
            Highlight the {(stats?.realWords ?? 4895).toLocaleString()} real words
          </button>
        </div>

        {/* Stat */}
        <div className="wp-hide-sm" style={{ position: "absolute", top: 30, right: 32, textAlign: "right", zIndex: 5, pointerEvents: "none" }}>
          <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-.01em", color: "#fff", fontVariantNumeric: "tabular-nums", textShadow: "0 1px 16px rgba(0,0,0,.85)" }}>
            {stats ? stats.total.toLocaleString() : "—"}
          </div>
          <div style={{ fontSize: 12, color: "#8b97b6", marginTop: 3 }}>named waypoints</div>
        </div>

        {/* hint */}
        <div style={{ position: "absolute", bottom: 18, right: 32, fontSize: 12, color: "#6b7590", zIndex: 5, pointerEvents: "none", textShadow: "0 1px 10px rgba(0,0,0,.9)" }}>
          Drag to explore · click a dot
        </div>
      </section>

      {/* Readout: density by state */}
      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "64px 24px 8px" }}>
        <SectionLabel>Where the names cluster</SectionLabel>
        <p style={{ fontSize: 15, color: "#8b97b6", margin: "10px 0 26px", lineHeight: 1.6, maxWidth: 560 }}>
          The density isn&apos;t random — it traces the busiest airspace in the country. Here&apos;s
          where the most named waypoints hang.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 9 }}>
          {(stats?.byState || []).slice(0, 12).map((s) => (
            <div key={s.st} style={{ display: "grid", gridTemplateColumns: "150px 1fr 60px", alignItems: "center", gap: 14 }}>
              <span style={{ fontSize: 14, color: "#c4cde2" }}>{STATES[s.st] || s.st}</span>
              <span style={{ height: 7, background: "rgba(255,255,255,.05)", borderRadius: 4, overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", width: `${(s.n / maxState) * 100}%`, background: "linear-gradient(90deg,#ff9f1c,#ff7a2f)", borderRadius: 4 }} />
              </span>
              <span style={{ fontSize: 13, color: "#7e8aa6", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {s.n.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* The weird ones */}
      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "56px 24px 8px" }}>
        <SectionLabel>The weird ones</SectionLabel>
        <p style={{ fontSize: 15, color: "#8b97b6", margin: "10px 0 24px", lineHeight: 1.6, maxWidth: 560 }}>
          Controllers name these, and they have a sense of humor. Tap any to fly to it.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))", gap: 0 }}>
          {curated.map((c) => (
            <button key={c.id} onClick={() => choose(c)} style={{ display: "flex", gap: 14, alignItems: "baseline", textAlign: "left", padding: "13px 0", border: "none", borderBottom: "1px solid rgba(255,255,255,.06)", background: "transparent", cursor: "pointer", width: "100%" }}>
              <span style={{ font: "600 14px/1 ui-monospace, SFMono-Regular, Menlo, monospace", letterSpacing: ".06em", color: ACCENT, minWidth: 62 }}>{c.id}</span>
              <span style={{ fontSize: 14, color: "#9aa6c4", lineHeight: 1.5 }}>{c.caption}</span>
            </button>
          ))}
        </div>
      </section>

      {/* All the real words */}
      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "48px 24px 110px" }}>
        <SectionLabel>
          Real words in the sky <span style={{ color: "#55607c" }}>· {words.length.toLocaleString()}</span>
        </SectionLabel>
        <p style={{ fontSize: 15, color: "#8b97b6", margin: "10px 0 18px", lineHeight: 1.6, maxWidth: 560 }}>
          Every plain English word that&apos;s also a real waypoint. All of them.
        </p>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter"
          spellCheck={false}
          style={{ marginBottom: 22, width: "min(240px,100%)", fontSize: 14, textTransform: "uppercase", padding: "9px 0", border: "none", borderBottom: "1px solid rgba(255,255,255,.16)", outline: "none", background: "transparent", color: "#fff", caretColor: ACCENT }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 18px" }}>
          {filteredWords.map((w) => (
            <button key={w.id} onClick={() => choose(w)} style={{ font: "500 13px/1 ui-monospace, SFMono-Regular, Menlo, monospace", letterSpacing: ".04em", color: "#aeb9d8", border: "none", background: "none", padding: 0, cursor: "pointer" }} className="wp-word">
              {w.id}
            </button>
          ))}
          {filteredWords.length === 0 && <span style={{ fontSize: 14, color: "#55607c" }}>nothing matches that.</span>}
        </div>
      </section>
    </main>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 21, fontWeight: 600, letterSpacing: -0.4, color: "#eef2fb", margin: 0 }}>
      {children}
    </h2>
  )
}
