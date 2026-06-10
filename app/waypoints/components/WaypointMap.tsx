"use client"

import { useEffect, useRef, useState } from "react"
import { geoAlbersUsa, geoPath, type GeoProjection } from "d3-geo"
import { zoom as d3zoom, zoomIdentity, type ZoomTransform } from "d3-zoom"
import { quadtree, type Quadtree } from "d3-quadtree"
import { select } from "d3-selection"
import "d3-transition"
import { feature } from "topojson-client"

export type Point = { id: string; lat: number; lon: number; st: string }

type Node = { i: number; x: number; y: number }

// Clean light atlas palette.
const BG = "#ffffff" // paper
const LAND = "#fbfbfa" // barely-there landmass fill
const LAND_LINE = "rgba(20,30,50,0.07)" // state hairlines
const STAR = "44,58,78" // base waypoint dots (rgb) — soft slate
const ACCENT = "#e8462d"

interface Props {
  points: Point[]
  wordSet: Set<string>
  selected: Point | null
  highlightWords: boolean
  onSelect: (p: Point) => void
}

export default function WaypointMap({ points, wordSet, selected, highlightWords, onSelect }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 })
  const projRef = useRef<GeoProjection | null>(null)
  const xsRef = useRef<Float64Array>(new Float64Array(0))
  const ysRef = useRef<Float64Array>(new Float64Array(0))
  const okRef = useRef<Uint8Array>(new Uint8Array(0))
  const wordRef = useRef<Uint8Array>(new Uint8Array(0))
  const treeRef = useRef<Quadtree<Node> | null>(null)
  const landRef = useRef<Path2D | null>(null)
  const fcRef = useRef<GeoJSON.FeatureCollection | null>(null)
  const tRef = useRef<ZoomTransform>(zoomIdentity)
  const hoverRef = useRef(-1)
  const selIdxRef = useRef(-1)
  const highlightRef = useRef(highlightWords)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zoomRef = useRef<any>(null)
  const idIndexRef = useRef<Map<string, number>>(new Map())
  const fadeRef = useRef(0)
  const rafRef = useRef(0)

  const [tip, setTip] = useState<{ x: number; y: number; id: string; st: string } | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    highlightRef.current = highlightWords
    draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightWords])

  // Build id index + word flags once.
  useEffect(() => {
    const idx = new Map<string, number>()
    const word = new Uint8Array(points.length)
    for (let i = 0; i < points.length; i++) {
      idx.set(points[i].id, i)
      word[i] = wordSet.has(points[i].id) ? 1 : 0
    }
    idIndexRef.current = idx
    wordRef.current = word
  }, [points, wordSet])

  // Load the US outline, then lay everything out.
  useEffect(() => {
    let alive = true
    fetch("/us-states-10m.json")
      .then((r) => r.json())
      .then((topo) => {
        if (!alive) return
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fcRef.current = feature(topo, (topo as any).objects.states) as unknown as GeoJSON.FeatureCollection
        layout()
        setReady(true)
        intro()
      })
    return () => {
      alive = false
      cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function layout() {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    const fc = fcRef.current
    if (!wrap || !canvas || !fc) return

    const w = wrap.clientWidth
    const h = wrap.clientHeight
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    sizeRef.current = { w, h, dpr }
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    canvas.style.width = w + "px"
    canvas.style.height = h + "px"

    const proj = geoAlbersUsa().fitExtent([[w * 0.04, h * 0.08], [w * 0.96, h * 0.92]], fc)
    projRef.current = proj

    const land = new Path2D()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    geoPath(proj, land as any)(fc)
    landRef.current = land

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
      }
    }
    xsRef.current = xs
    ysRef.current = ys
    okRef.current = ok
    treeRef.current = quadtree<Node>().x((d) => d.x).y((d) => d.y).addAll(nodes)

    if (!zoomRef.current) {
      const z = d3zoom<HTMLCanvasElement, unknown>()
        .scaleExtent([1, 90])
        .on("zoom", (e) => {
          tRef.current = e.transform
          draw()
        })
      zoomRef.current = z
      select(canvas).call(z)
    }
    draw()
  }

  function intro() {
    const start = performance.now()
    const step = (now: number) => {
      fadeRef.current = Math.min(1, (now - start) / 800)
      draw()
      if (fadeRef.current < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
  }

  function draw() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const { w, h, dpr } = sizeRef.current
    const t = tRef.current
    const k = t.k
    const xs = xsRef.current
    const ys = ysRef.current
    const ok = okRef.current
    const word = wordRef.current
    const fade = fadeRef.current
    const hl = highlightRef.current

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, w, h)
    ctx.translate(t.x, t.y)
    ctx.scale(k, k)

    // Landmass — a real, clean filled map so the dots have ground to sit on.
    const land = landRef.current
    if (land) {
      ctx.fillStyle = LAND
      ctx.fill(land)
      ctx.lineWidth = 0.7 / k
      ctx.strokeStyle = LAND_LINE
      ctx.stroke(land)
    }

    const n = xs.length
    const s = 1.1 / k
    const half = s / 2

    // Base waypoints.
    ctx.fillStyle = `rgba(${STAR},${(0.42 * fade).toFixed(3)})`
    for (let i = 0; i < n; i++) {
      if (!ok[i] || (hl && word[i])) continue
      ctx.fillRect(xs[i] - half, ys[i] - half, s, s)
    }

    // Real words.
    if (hl) {
      ctx.fillStyle = ACCENT
      const ws = 1.8 / k
      for (let i = 0; i < n; i++) {
        if (!ok[i] || !word[i]) continue
        ctx.beginPath()
        ctx.arc(xs[i], ys[i], ws / 2, 0, 6.283)
        ctx.fill()
      }
    }

    // Hover.
    const hi = hoverRef.current
    if (hi >= 0 && ok[hi]) {
      ctx.fillStyle = "#16223a"
      ctx.beginPath()
      ctx.arc(xs[hi], ys[hi], 2.6 / k, 0, 6.283)
      ctx.fill()
    }

    // Selected: glow + ring.
    const si = selIdxRef.current
    if (si >= 0 && ok[si]) {
      ctx.save()
      ctx.shadowColor = ACCENT
      ctx.shadowBlur = 14
      ctx.fillStyle = ACCENT
      ctx.beginPath()
      ctx.arc(xs[si], ys[si], 3.4 / k, 0, 6.283)
      ctx.fill()
      ctx.restore()
      ctx.lineWidth = 1.1 / k
      ctx.strokeStyle = "rgba(255,159,28,0.5)"
      ctx.beginPath()
      ctx.arc(xs[si], ys[si], 9 / k, 0, 6.283)
      ctx.stroke()
    }

    // Selected label (screen space).
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (si >= 0 && ok[si]) {
      const sx = t.x + xs[si] * k
      const sy = t.y + ys[si] * k
      const label = points[si].id
      ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif'
      const tw = ctx.measureText(label).width
      const lx = Math.min(Math.max(sx + 13, 8), w - tw - 16)
      const ly = Math.min(Math.max(sy, 20), h - 8)
      ctx.fillStyle = "rgba(10,14,23,0.86)"
      const rx = lx - 7, ry = ly - 13, rw = tw + 14, rh = 21, rr = 6
      ctx.beginPath()
      ctx.moveTo(rx + rr, ry)
      ctx.arcTo(rx + rw, ry, rx + rw, ry + rh, rr)
      ctx.arcTo(rx + rw, ry + rh, rx, ry + rh, rr)
      ctx.arcTo(rx, ry + rh, rx, ry, rr)
      ctx.arcTo(rx, ry, rx + rw, ry, rr)
      ctx.fill()
      ctx.fillStyle = "#fff"
      ctx.fillText(label, lx, ly + 1)
    }
  }

  // Ease to the selected waypoint.
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
    const k = 14
    const target = zoomIdentity.translate(w / 2 - xsRef.current[idx] * k, h / 2 - ysRef.current[idx] * k).scale(k)
    select(canvas).transition().duration(800).call(z.transform, target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  // Resize.
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

  // Pointer.
  function pick(clientX: number, clientY: number): number {
    const canvas = canvasRef.current
    const tree = treeRef.current
    if (!canvas || !tree) return -1
    const rect = canvas.getBoundingClientRect()
    const t = tRef.current
    const bx = (clientX - rect.left - t.x) / t.k
    const by = (clientY - rect.top - t.y) / t.k
    const found = tree.find(bx, by, 13 / t.k)
    return found ? found.i : -1
  }

  function onMove(e: React.PointerEvent) {
    const i = pick(e.clientX, e.clientY)
    if (i !== hoverRef.current) {
      hoverRef.current = i
      draw()
    }
    const rect = canvasRef.current!.getBoundingClientRect()
    if (i >= 0) setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, id: points[i].id, st: points[i].st })
    else if (tip) setTip(null)
  }

  function onLeave() {
    if (hoverRef.current !== -1) {
      hoverRef.current = -1
      draw()
    }
    setTip(null)
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
        style={{ display: "block", cursor: hoverRef.current >= 0 ? "pointer" : "grab", touchAction: "none" }}
      />
      {tip && (
        <div
          style={{
            position: "absolute",
            left: tip.x + 13,
            top: tip.y + 13,
            pointerEvents: "none",
            font: '600 12px/1 -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
            color: "#fff",
            background: "rgba(10,14,23,.9)",
            border: "1px solid rgba(255,255,255,.13)",
            padding: "6px 9px",
            borderRadius: 7,
            whiteSpace: "nowrap",
            transform: tip.x > sizeRef.current.w - 130 ? "translateX(calc(-100% - 26px))" : "none",
          }}
        >
          {tip.id} <span style={{ color: "#8b97b6", marginLeft: 2 }}>{tip.st || "—"}</span>
        </div>
      )}
    </div>
  )
}
