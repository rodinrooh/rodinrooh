"use client"

import { useEffect, useRef, useState } from "react"
import { geoAlbersUsa, geoPath, type GeoProjection } from "d3-geo"
import { zoom as d3zoom, zoomIdentity, type ZoomTransform } from "d3-zoom"
import { quadtree, type Quadtree } from "d3-quadtree"
import { select } from "d3-selection"
import "d3-transition"
import { feature } from "topojson-client"

export type Point = { id: string; lat: number; lon: number; st: string }

// Pull a node out of the quadtree-friendly index shape.
type Node = { i: number; x: number; y: number }

const BG = "#070a12"
const STAR = "rgba(214,224,255,"
const ACCENT = "#ffb84d"

interface Props {
  points: Point[]
  wordSet: Set<string>
  selected: Point | null
  highlightWords: boolean
  onSelect: (p: Point) => void
}

export default function Constellation({ points, wordSet, selected, highlightWords, onSelect }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Geometry / state kept in refs so the draw loop never goes stale.
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 })
  const projRef = useRef<GeoProjection | null>(null)
  const xsRef = useRef<Float64Array>(new Float64Array(0))
  const ysRef = useRef<Float64Array>(new Float64Array(0))
  const okRef = useRef<Uint8Array>(new Uint8Array(0)) // 1 if projected inside US
  const wordRef = useRef<Uint8Array>(new Uint8Array(0)) // 1 if real-word waypoint
  const treeRef = useRef<Quadtree<Node> | null>(null)
  const bordersRef = useRef<Path2D | null>(null)
  const tRef = useRef<ZoomTransform>(zoomIdentity)
  const hoverRef = useRef<number>(-1)
  const selIdxRef = useRef<number>(-1)
  const highlightRef = useRef(highlightWords)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zoomRef = useRef<any>(null)
  const fadeRef = useRef(0) // 0→1 intro fade
  const rafRef = useRef(0)

  const [tip, setTip] = useState<{ x: number; y: number; id: string; st: string } | null>(null)
  const [ready, setReady] = useState(false)

  // Index by id for fast selection lookups.
  const idIndexRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    highlightRef.current = highlightWords
    draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightWords])

  // ---- one-time setup: load borders, build index ----------------------------
  useEffect(() => {
    let alive = true
    const idx = new Map<string, number>()
    for (let i = 0; i < points.length; i++) idx.set(points[i].id, i)
    idIndexRef.current = idx
    wordRef.current = new Uint8Array(points.length)
    for (let i = 0; i < points.length; i++) wordRef.current[i] = wordSet.has(points[i].id) ? 1 : 0

    fetch("/us-states-10m.json")
      .then((r) => r.json())
      .then((topo) => {
        if (!alive) return
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fc = feature(topo, (topo as any).objects.states) as unknown as GeoJSON.FeatureCollection
        bordersFCRef.current = fc
        layout()
        setReady(true)
        runIntro()
      })
    return () => {
      alive = false
      cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const bordersFCRef = useRef<GeoJSON.FeatureCollection | null>(null)

  // ---- (re)project everything for the current canvas size --------------------
  function layout() {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    const fc = bordersFCRef.current
    if (!wrap || !canvas || !fc) return

    const w = wrap.clientWidth
    const h = wrap.clientHeight
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    sizeRef.current = { w, h, dpr }
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    canvas.style.width = w + "px"
    canvas.style.height = h + "px"

    // Albers USA, fitted with a little inset padding.
    const proj = geoAlbersUsa().fitExtent(
      [
        [w * 0.03, h * 0.06],
        [w * 0.97, h * 0.94],
      ],
      fc,
    )
    projRef.current = proj

    // Borders as a reusable Path2D in base (pre-zoom) coordinates.
    const p2d = new Path2D()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gp = geoPath(proj, p2d as any)
    gp(fc)
    bordersRef.current = p2d

    // Project every waypoint once.
    const n = points.length
    const xs = new Float64Array(n)
    const ys = new Float64Array(n)
    const ok = new Uint8Array(n)
    const nodes: Node[] = []
    for (let i = 0; i < n; i++) {
      const xy = proj([points[i].lon, points[i].lat])
      if (xy) {
        xs[i] = xy[0]
        ys[i] = xy[1]
        ok[i] = 1
        nodes.push({ i, x: xy[0], y: xy[1] })
      } else {
        ok[i] = 0
      }
    }
    xsRef.current = xs
    ysRef.current = ys
    okRef.current = ok
    treeRef.current = quadtree<Node>()
      .x((d) => d.x)
      .y((d) => d.y)
      .addAll(nodes)

    setupZoom()
    draw()
  }

  function setupZoom() {
    const canvas = canvasRef.current
    if (!canvas || zoomRef.current) return
    const z = d3zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([1, 80])
      .on("zoom", (e) => {
        tRef.current = e.transform
        draw()
      })
    zoomRef.current = z
    select(canvas).call(z)
  }

  function runIntro() {
    const start = performance.now()
    const dur = 900
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur)
      fadeRef.current = t
      draw()
      if (t < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
  }

  // ---- the draw loop ---------------------------------------------------------
  function draw() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const { w, h, dpr } = sizeRef.current
    const t = tRef.current
    const xs = xsRef.current
    const ys = ysRef.current
    const ok = okRef.current
    const word = wordRef.current
    const fade = fadeRef.current
    const k = t.k

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, w, h)

    ctx.translate(t.x, t.y)
    ctx.scale(k, k)

    // Borders — hairline, faint.
    if (bordersRef.current) {
      ctx.lineWidth = 0.6 / k
      ctx.strokeStyle = "rgba(120,150,210,0.16)"
      ctx.stroke(bordersRef.current)
    }

    const n = xs.length
    const s = 1.15 / k // star size in world units → constant on screen
    const half = s / 2
    const hl = highlightRef.current

    // Base stars (all of them).
    ctx.fillStyle = STAR + (0.5 * fade).toFixed(3) + ")"
    for (let i = 0; i < n; i++) {
      if (!ok[i]) continue
      if (hl && word[i]) continue // drawn brighter below
      ctx.fillRect(xs[i] - half, ys[i] - half, s, s)
    }

    // Real-word stars lit up.
    if (hl) {
      ctx.fillStyle = `rgba(255,184,77,${(0.92 * fade).toFixed(3)})`
      const ws = 1.9 / k
      const wh = ws / 2
      for (let i = 0; i < n; i++) {
        if (!ok[i] || !word[i]) continue
        ctx.fillRect(xs[i] - wh, ys[i] - wh, ws, ws)
      }
    }

    // Hovered star.
    const hi = hoverRef.current
    if (hi >= 0 && ok[hi]) {
      ctx.fillStyle = ACCENT
      ctx.beginPath()
      ctx.arc(xs[hi], ys[hi], 3 / k, 0, Math.PI * 2)
      ctx.fill()
    }

    // Selected star — bright with a glow + ring.
    const si = selIdxRef.current
    if (si >= 0 && ok[si]) {
      ctx.save()
      ctx.shadowColor = ACCENT
      ctx.shadowBlur = 16
      ctx.fillStyle = "#fff"
      ctx.beginPath()
      ctx.arc(xs[si], ys[si], 3.2 / k, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      ctx.lineWidth = 1.1 / k
      ctx.strokeStyle = ACCENT
      ctx.beginPath()
      ctx.arc(xs[si], ys[si], 8 / k, 0, Math.PI * 2)
      ctx.stroke()
    }

    // Selected label in screen space.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (si >= 0 && ok[si]) {
      const sx = t.x + xs[si] * k
      const sy = t.y + ys[si] * k
      const label = points[si].id
      ctx.font = "600 13px ui-monospace, SFMono-Regular, Menlo, monospace"
      const tw = ctx.measureText(label).width
      const px = Math.min(Math.max(sx + 12, 6), w - tw - 14)
      const py = Math.min(Math.max(sy - 10, 18), h - 8)
      ctx.fillStyle = "rgba(7,10,18,0.82)"
      ctx.fillRect(px - 6, py - 14, tw + 12, 20)
      ctx.fillStyle = ACCENT
      ctx.fillText(label, px, py)
    }
  }

  // ---- selection: ease the view to the chosen star --------------------------
  useEffect(() => {
    const idx = selected ? idIndexRef.current.get(selected.id) ?? -1 : -1
    selIdxRef.current = idx
    const canvas = canvasRef.current
    const z = zoomRef.current
    if (idx < 0 || !canvas || !z || !okRef.current[idx]) {
      draw()
      return
    }
    const { w, h } = sizeRef.current
    const bx = xsRef.current[idx]
    const by = ysRef.current[idx]
    const k = 18
    const target = zoomIdentity.translate(w / 2 - bx * k, h / 2 - by * k).scale(k)
    select(canvas).transition().duration(820).call(z.transform, target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  // ---- resize ----------------------------------------------------------------
  useEffect(() => {
    if (!ready) return
    let raf = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(layout)
    })
    if (wrapRef.current) ro.observe(wrapRef.current)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  // ---- pointer: hover + click ------------------------------------------------
  function pick(clientX: number, clientY: number): number {
    const canvas = canvasRef.current
    const tree = treeRef.current
    if (!canvas || !tree) return -1
    const rect = canvas.getBoundingClientRect()
    const mx = clientX - rect.left
    const my = clientY - rect.top
    const t = tRef.current
    const bx = (mx - t.x) / t.k
    const by = (my - t.y) / t.k
    const r = 14 / t.k
    const found = tree.find(bx, by, r)
    return found ? found.i : -1
  }

  function onMove(e: React.PointerEvent) {
    const i = pick(e.clientX, e.clientY)
    if (i !== hoverRef.current) {
      hoverRef.current = i
      draw()
    }
    const canvas = canvasRef.current!
    canvas.style.cursor = i >= 0 ? "pointer" : "grab"
    if (i >= 0) {
      const rect = canvas.getBoundingClientRect()
      setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, id: points[i].id, st: points[i].st })
    } else if (tip) {
      setTip(null)
    }
  }

  function onLeave() {
    hoverRef.current = -1
    setTip(null)
    draw()
  }

  function onClick(e: React.MouseEvent) {
    const i = pick(e.clientX, e.clientY)
    if (i >= 0) onSelect(points[i])
  }

  return (
    <div ref={wrapRef} style={{ position: "absolute", inset: 0, background: BG }}>
      <canvas
        ref={canvasRef}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        onClick={onClick}
        style={{ display: "block", touchAction: "none" }}
      />
      {tip && (
        <div
          style={{
            position: "absolute",
            left: tip.x + 12,
            top: tip.y + 12,
            pointerEvents: "none",
            font: "600 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace",
            letterSpacing: ".06em",
            color: "#fff",
            background: "rgba(7,10,18,.9)",
            border: "1px solid rgba(255,255,255,.12)",
            padding: "5px 7px",
            borderRadius: 5,
            whiteSpace: "nowrap",
            transform: tip.x > sizeRef.current.w - 120 ? "translateX(-100%)" : "none",
          }}
        >
          {tip.id} <span style={{ color: "#7e8aa6" }}>{tip.st || "—"}</span>
        </div>
      )}
    </div>
  )
}
