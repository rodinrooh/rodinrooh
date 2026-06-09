"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import type { Point } from "./components/Map"

const WaypointMap = dynamic(() => import("./components/Map"), { ssr: false })

type Row = [string, number, number, string]
type WeirdItem = Point & { caption?: string }

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
  AS: "American Samoa", MP: "the Northern Marianas",
}

const toPoint = (r: Row): Point => ({ id: r[0], lat: r[1], lon: r[2], st: r[3] })

function coords(lat: number, lon: number) {
  const la = `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? "N" : "S"}`
  const lo = `${Math.abs(lon).toFixed(4)}°${lon >= 0 ? "E" : "W"}`
  return `${la}, ${lo}`
}

function placeLine(st: string) {
  const name = STATES[st]
  return name ? `over ${name}` : "out over America"
}

export default function Waypoints() {
  const [byId, setById] = useState<Map<string, Point> | null>(null)
  const [ids, setIds] = useState<string[]>([])
  const [count, setCount] = useState(0)
  const [curated, setCurated] = useState<WeirdItem[]>([])
  const [words, setWords] = useState<Point[]>([])

  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Point | null>(null)
  const [filter, setFilter] = useState("")
  const mapAnchor = useRef<HTMLDivElement | null>(null)

  // Load the precomputed static data once.
  useEffect(() => {
    Promise.all([
      fetch("/waypoints.json").then((r) => r.json()),
      fetch("/waypoints-weird.json").then((r) => r.json()),
    ]).then(([data, weird]) => {
      const map = new Map<string, Point>()
      const idList: string[] = []
      for (const r of data.rows as Row[]) {
        const p = toPoint(r)
        if (!map.has(p.id)) {
          map.set(p.id, p)
          idList.push(p.id)
        }
      }
      idList.sort()
      setById(map)
      setIds(idList)
      setCount(idList.length)
      setCurated(weird.curated as WeirdItem[])
      setWords((weird.words as Row[]).map(toPoint))
    })
  }, [])

  const q = useMemo(() => query.toUpperCase().replace(/[^A-Z]/g, ""), [query])
  const exact = q && byId ? byId.get(q) || null : null

  // Prefix suggestions when there's no exact hit.
  const suggestions = useMemo(() => {
    if (!q || exact || q.length < 2) return []
    const out: string[] = []
    for (const id of ids) {
      if (id.startsWith(q)) {
        out.push(id)
        if (out.length >= 8) break
      }
    }
    return out
  }, [q, exact, ids])

  // Auto-reveal an exact match as you type it.
  useEffect(() => {
    if (exact) setSelected(exact)
  }, [exact])

  function choose(p: Point) {
    setQuery(p.id)
    setSelected(p)
    requestAnimationFrame(() =>
      mapAnchor.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    )
  }

  const WORD_LIMIT = 240
  const filteredWords = useMemo(() => {
    const f = filter.toUpperCase().replace(/[^A-Z]/g, "")
    if (!f) return words
    return words.filter((w) => w.id.includes(f))
  }, [filter, words])
  const shownWords = filter ? filteredWords : filteredWords.slice(0, WORD_LIMIT)
  const truncated = !filter && words.length > WORD_LIMIT

  const loading = !byId

  return (
    <main
      style={{
        maxWidth: 1120,
        margin: "0 auto",
        padding: "48px 24px 120px",
        color: "#111",
        fontFamily:
          '-apple-system, "SF Pro Text", BlinkMacSystemFont, "Helvetica Neue", sans-serif',
      }}
    >
      {/* Header */}
      <h1 style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1.4, lineHeight: 1.02, margin: 0 }}>
        Every Name in the Sky
      </h1>
      <p style={{ fontSize: 17, lineHeight: 1.6, color: "#555", margin: "16px 0 0", maxWidth: 600 }}>
        There are {count ? count.toLocaleString() : "tens of thousands of"}{" "}
        named navigation waypoints floating invisibly over America — short names that planes fly
        between, printed on charts you&apos;ll never see. Type any word and find out if it&apos;s one
        of them.
      </p>

      {/* Map hero — always on, search overlaid like a HUD */}
      <div
        ref={mapAnchor}
        style={{
          position: "relative",
          marginTop: 28,
          height: "66vh",
          minHeight: 500,
          borderRadius: 14,
          overflow: "hidden",
          background: "#0b1b2e",
          boxShadow: "0 1px 2px rgba(0,0,0,.05), 0 18px 50px -20px rgba(0,0,0,.35)",
        }}
      >
        <WaypointMap selected={selected} />

        {/* floating search panel */}
        <div
          style={{
            position: "absolute",
            top: 18,
            left: 18,
            width: "min(440px, calc(100% - 36px))",
            background: "rgba(255,255,255,.94)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            borderRadius: 13,
            padding: "16px 18px",
            boxShadow: "0 10px 34px rgba(0,0,0,.26)",
          }}
        >
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a word…"
            spellCheck={false}
            autoCapitalize="characters"
            style={{
              width: "100%",
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              padding: 0,
              border: "none",
              outline: "none",
              background: "transparent",
              color: "#111",
            }}
          />

          {(loading || (!loading && (exact || q.length >= 1))) && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #ececec" }}>
              {loading && <p style={{ color: "#999", fontSize: 14, margin: 0 }}>Loading the sky…</p>}

              {!loading && exact && (
                <>
                  <p style={{ fontSize: 16, margin: 0, lineHeight: 1.45 }}>
                    <strong>{exact.id}</strong> is real — floating {placeLine(exact.st)}.
                  </p>
                  <p
                    style={{
                      fontSize: 12.5,
                      color: "#999",
                      margin: "5px 0 0",
                      letterSpacing: ".02em",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {coords(exact.lat, exact.lon)}
                  </p>
                </>
              )}

              {!loading && !exact && q.length >= 1 && (
                <>
                  <p style={{ fontSize: 15, margin: 0, color: "#444" }}>
                    No waypoint named <strong>{q}</strong> — yet.
                  </p>
                  {suggestions.length > 0 && (
                    <p style={{ fontSize: 13, color: "#888", margin: "8px 0 0" }}>
                      Close:{" "}
                      {suggestions.map((s, i) => (
                        <span key={s}>
                          {i > 0 && ", "}
                          <button onClick={() => choose(byId!.get(s)!)} style={linkBtn}>
                            {s}
                          </button>
                        </span>
                      ))}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* The weird ones */}
      <section style={{ marginTop: 72, borderTop: "1px solid #eee", paddingTop: 40 }}>
        <h2 style={{ fontSize: 22, fontWeight: 640, letterSpacing: -0.4, margin: 0 }}>
          The weird ones
        </h2>
        <p style={{ fontSize: 15, color: "#666", margin: "10px 0 0", lineHeight: 1.6 }}>
          Controllers name these things, and they have a sense of humor. A few favorites — tap any to
          see where it hides.
        </p>

        <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 2 }}>
          {curated.map((c) => (
            <button
              key={c.id}
              onClick={() => choose(c)}
              style={{
                display: "flex",
                gap: 16,
                alignItems: "baseline",
                textAlign: "left",
                padding: "12px 0",
                border: "none",
                borderBottom: "1px solid #f1f1f1",
                background: "transparent",
                cursor: "pointer",
                width: "100%",
              }}
            >
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  minWidth: 72,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {c.id}
              </span>
              <span style={{ fontSize: 15, color: "#555", lineHeight: 1.5 }}>{c.caption}</span>
            </button>
          ))}
        </div>

        {/* Real words */}
        <h3 style={{ fontSize: 16, fontWeight: 620, margin: "44px 0 0" }}>
          Real words hiding in the sky{" "}
          <span style={{ color: "#aaa", fontWeight: 400 }}>({words.length.toLocaleString()})</span>
        </h3>
        <p style={{ fontSize: 14, color: "#888", margin: "8px 0 0", lineHeight: 1.6 }}>
          Every plain English word that also happens to be a real waypoint.
        </p>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter…"
          spellCheck={false}
          style={{
            marginTop: 16,
            width: "100%",
            maxWidth: 260,
            fontSize: 14,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            padding: "8px 0",
            border: "none",
            borderBottom: "1px solid #ddd",
            outline: "none",
            background: "transparent",
          }}
        />
        <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", gap: "8px 14px" }}>
          {shownWords.map((w) => (
            <button
              key={w.id + w.lat}
              onClick={() => choose(w)}
              style={{
                fontSize: 13,
                fontWeight: 500,
                letterSpacing: "0.06em",
                color: "#333",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                padding: 0,
              }}
            >
              {w.id}
            </button>
          ))}
          {filteredWords.length === 0 && (
            <span style={{ fontSize: 14, color: "#aaa" }}>nothing matches that.</span>
          )}
        </div>
        {truncated && (
          <p style={{ fontSize: 13, color: "#aaa", margin: "18px 0 0" }}>
            Showing {WORD_LIMIT} of {words.length.toLocaleString()} — filter to find a specific word.
          </p>
        )}
      </section>
    </main>
  )
}

const linkBtn: React.CSSProperties = {
  border: "none",
  background: "transparent",
  padding: 0,
  font: "inherit",
  color: "#111",
  textDecoration: "underline",
  cursor: "pointer",
}
