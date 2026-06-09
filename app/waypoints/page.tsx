"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import type { Point } from "./components/Constellation"

const Constellation = dynamic(() => import("./components/Constellation"), { ssr: false })

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

      {/* Top bar */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,.07)" }}>
        <span style={{ font: "600 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace", letterSpacing: ".22em", color: "#cdd6ee" }}>
          EVERY&nbsp;NAME&nbsp;IN&nbsp;THE&nbsp;SKY
        </span>
        <span style={{ font: "500 10.5px/1 ui-monospace, Menlo, monospace", letterSpacing: ".14em", color: "#55607c" }}>
          FAA NASR · 2026-05-14
        </span>
      </header>

      {/* Constellation hero */}
      <section style={{ position: "relative", height: "calc(100vh - 53px)", minHeight: 560, overflow: "hidden" }}>
        {!loading && (
          <Constellation
            points={points}
            wordSet={wordSet}
            selected={selected}
            highlightWords={highlightWords}
            onSelect={(p) => setSelected(p)}
          />
        )}

        {/* Search + title HUD */}
        <div className="wp-search" style={{ position: "absolute", top: 22, left: 22, width: "min(380px, calc(100% - 44px))", zIndex: 5 }}>
          <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: -0.8, lineHeight: 1.04, margin: "0 0 6px", textShadow: "0 2px 24px rgba(0,0,0,.7)" }}>
            Every name in the sky
          </h1>
          <p style={{ fontSize: 13, lineHeight: 1.5, color: "#9aa6c4", margin: "0 0 14px", textShadow: "0 1px 12px rgba(0,0,0,.8)" }}>
            {stats ? stats.total.toLocaleString() : "69,010"} navigation waypoints hover invisibly over America.
            Each dot is a real name planes fly between. Find yours.
          </p>

          <div style={{ background: "rgba(10,14,26,.72)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 11, padding: "11px 13px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ color: "#ffb84d", font: "600 15px/1 ui-monospace, Menlo, monospace" }}>⌖</span>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="TYPE A NAME"
                spellCheck={false}
                autoCapitalize="characters"
                style={{ flex: 1, font: "600 18px/1 ui-monospace, SFMono-Regular, Menlo, monospace", letterSpacing: ".12em", textTransform: "uppercase", border: "none", outline: "none", background: "transparent", color: "#fff", caretColor: "#ffb84d", minWidth: 0 }}
              />
            </div>

            {!loading && (exact || q.length >= 1) && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,.1)" }}>
                {exact ? (
                  <>
                    <div style={{ fontSize: 14, lineHeight: 1.4 }}>
                      <b style={{ color: "#ffb84d" }}>{exact.id}</b> is real — floating {placeLine(exact.st)}.
                    </div>
                    <div style={{ font: "500 11px/1 ui-monospace, Menlo, monospace", color: "#7e8aa6", marginTop: 5, letterSpacing: ".04em" }}>
                      {coords(exact.lat, exact.lon)}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: "#9aa6c4" }}>
                    No waypoint named <b style={{ color: "#cdd6ee" }}>{q}</b> — yet.
                    {suggestions.length > 0 && (
                      <div style={{ marginTop: 7, font: "500 12px/1.6 ui-monospace, Menlo, monospace" }}>
                        {suggestions.map((s, i) => (
                          <span key={s}>
                            {i > 0 && <span style={{ color: "#444c66" }}> · </span>}
                            <button onClick={() => choose(byId.get(s)!)} style={{ border: "none", background: "none", padding: 0, color: "#ffb84d", cursor: "pointer", font: "inherit" }}>{s}</button>
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
            style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", background: highlightWords ? "rgba(255,184,77,.16)" : "rgba(10,14,26,.6)", border: `1px solid ${highlightWords ? "rgba(255,184,77,.5)" : "rgba(255,255,255,.12)"}`, color: highlightWords ? "#ffce8a" : "#9aa6c4", borderRadius: 999, padding: "7px 13px", font: "600 11px/1 ui-monospace, Menlo, monospace", letterSpacing: ".08em" }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: highlightWords ? "#ffb84d" : "#46506e", boxShadow: highlightWords ? "0 0 8px #ffb84d" : "none" }} />
            {(stats?.realWords ?? 4895).toLocaleString()} REAL WORDS
          </button>
        </div>

        {/* Stat HUD (top-right) */}
        <div className="wp-hide-sm" style={{ position: "absolute", top: 22, right: 24, textAlign: "right", zIndex: 5, pointerEvents: "none" }}>
          <div style={{ font: "700 34px/1 ui-monospace, Menlo, monospace", letterSpacing: "-.02em", color: "#fff", textShadow: "0 2px 20px rgba(0,0,0,.8)" }}>
            {stats ? stats.total.toLocaleString() : "—"}
          </div>
          <div style={{ font: "600 10px/1 ui-monospace, Menlo, monospace", letterSpacing: ".18em", color: "#7e8aa6", marginTop: 6 }}>
            NAMED WAYPOINTS
          </div>
        </div>

        {/* hint */}
        <div style={{ position: "absolute", bottom: 16, right: 24, font: "500 10.5px/1 ui-monospace, Menlo, monospace", letterSpacing: ".1em", color: "#55607c", zIndex: 5, pointerEvents: "none", textShadow: "0 1px 10px rgba(0,0,0,.9)" }}>
          DRAG TO PAN · SCROLL TO ZOOM · CLICK A STAR
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
            <div key={s.st} style={{ display: "grid", gridTemplateColumns: "150px 1fr 64px", alignItems: "center", gap: 14 }}>
              <span style={{ font: "500 13px/1 ui-monospace, Menlo, monospace", color: "#cdd6ee", letterSpacing: ".02em" }}>
                {STATES[s.st] || s.st}
              </span>
              <span style={{ height: 8, background: "rgba(255,255,255,.05)", borderRadius: 4, overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", width: `${(s.n / maxState) * 100}%`, background: "linear-gradient(90deg,#ffb84d,#ff8a3d)", borderRadius: 4 }} />
              </span>
              <span style={{ font: "600 12px/1 ui-monospace, Menlo, monospace", color: "#7e8aa6", textAlign: "right" }}>
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
              <span style={{ font: "600 14px/1 ui-monospace, Menlo, monospace", letterSpacing: ".08em", color: "#ffb84d", minWidth: 64 }}>{c.id}</span>
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
          placeholder="FILTER"
          spellCheck={false}
          style={{ marginBottom: 22, width: "min(260px,100%)", font: "600 13px/1 ui-monospace, Menlo, monospace", letterSpacing: ".1em", textTransform: "uppercase", padding: "9px 0", border: "none", borderBottom: "1px solid rgba(255,255,255,.16)", outline: "none", background: "transparent", color: "#fff", caretColor: "#ffb84d" }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: "9px 16px" }}>
          {filteredWords.map((w) => (
            <button key={w.id} onClick={() => choose(w)} style={{ font: "500 13px/1 ui-monospace, Menlo, monospace", letterSpacing: ".06em", color: wordSet.has(w.id) ? "#aeb9d8" : "#aeb9d8", border: "none", background: "none", padding: 0, cursor: "pointer" }} className="wp-word">
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
    <h2 style={{ font: "600 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace", letterSpacing: ".2em", textTransform: "uppercase", color: "#cdd6ee", margin: 0 }}>
      {children}
    </h2>
  )
}
