"use client"

import { useEffect, useRef, useState } from "react"
import { quadtree, type Quadtree } from "d3-quadtree"

export type Point = { id: string; lat: number; lon: number; st: string }

const MAPKIT_URL = "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js"
const ACCENT = "#e5484d"

type WNode = { i: number; x: number; y: number }

// Web-Mercator world coords in 0..1 (matches MapKit's projection).
const mercX = (lon: number) => (lon + 180) / 360
const mercY = (lat: number) => {
  const s = Math.sin((lat * Math.PI) / 180)
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)
}

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
  OG: "Gulf of Mexico",
}
const subtitleFor = (p: Point) => {
  const place = STATES[p.st] || ""
  const c = `${Math.abs(p.lat).toFixed(2)}°${p.lat >= 0 ? "N" : "S"} ${Math.abs(p.lon).toFixed(2)}°${p.lon >= 0 ? "E" : "W"}`
  return place ? `${place} · ${c}` : c
}

interface Props {
  points: Point[]
  selected: Point | null
  onSelect: (p: Point) => void
}

export default function WaypointMap({ points, selected, onSelect }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const mapElRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const mapRef = useRef<mapkit.Map | null>(null)
  const treeRef = useRef<Quadtree<WNode> | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef = useRef<any>(null)
  const idIndexRef = useRef<Map<string, number>>(new Map())
  const initRef = useRef(false)

  const xsRef = useRef<Float64Array>(new Float64Array(0))
  const ysRef = useRef<Float64Array>(new Float64Array(0))
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 })
  const viewRef = useRef({ left: 0, top: 0, sx: 1, sy: 1 })
  const hoverRef = useRef(-1)
  const runningRef = useRef(false)
  const rafRef = useRef(0)
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const downRef = useRef<{ x: number; y: number } | null>(null)

  const [tip, setTip] = useState<{ x: number; y: number; id: string; st: string } | null>(null)

  useEffect(() => {
    const idx = new Map<string, number>()
    const xs = new Float64Array(points.length)
    const ys = new Float64Array(points.length)
    const nodes: WNode[] = new Array(points.length)
    for (let i = 0; i < points.length; i++) {
      idx.set(points[i].id, i)
      xs[i] = mercX(points[i].lon)
      ys[i] = mercY(points[i].lat)
      nodes[i] = { i, x: xs[i], y: ys[i] }
    }
    idIndexRef.current = idx
    xsRef.current = xs
    ysRef.current = ys
    treeRef.current = quadtree<WNode>().x((d) => d.x).y((d) => d.y).addAll(nodes)
  }, [points])

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    function resize() {
      const wrap = wrapRef.current
      const canvas = canvasRef.current
      if (!wrap || !canvas) return
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      sizeRef.current = { w, h, dpr }
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = w + "px"
      canvas.style.height = h + "px"
    }

    function initMap() {
      const mk = window.mapkit
      if (!mk || !mapElRef.current) return
      mk.init({
        authorizationCallback: async (done: (t: string) => void) => {
          const res = await fetch("/waypoints/api/maps-token")
          const { token } = await res.json()
          done(token)
        },
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mkAny = mk as any
      const map = new mk.Map(mapElRef.current, {
        showsCompass: mk.FeatureVisibility.Hidden,
        showsScale: mk.FeatureVisibility.Hidden,
        showsMapTypeControl: false,
        showsZoomControl: true,
        isRotationEnabled: false,
      })
      mapRef.current = map
      ;(map as unknown as { region: unknown }).region = new mkAny.CoordinateRegion(
        new mk.Coordinate(39.5, -96),
        new mkAny.CoordinateSpan(34, 60),
      )
      resize()
      draw()
      // Repaint the dots only while the camera is moving — then idle.
      map.addEventListener("region-change-start", startLoop)
      map.addEventListener("region-change-end", stopLoop)
    }

    function startLoop() {
      if (runningRef.current) return
      runningRef.current = true
      if (safetyRef.current) clearTimeout(safetyRef.current)
      safetyRef.current = setTimeout(stopLoop, 5000) // never run away
      const tick = () => {
        draw()
        if (runningRef.current) rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    function stopLoop() {
      runningRef.current = false
      cancelAnimationFrame(rafRef.current)
      if (safetyRef.current) { clearTimeout(safetyRef.current); safetyRef.current = null }
      draw()
    }

    const ro = new ResizeObserver(() => { resize(); draw() })

    if (typeof window !== "undefined" && window.mapkit) initMap()
    else if (!document.querySelector(`script[src="${MAPKIT_URL}"]`)) {
      const s = document.createElement("script")
      s.src = MAPKIT_URL
      s.async = true
      s.onload = initMap
      document.head.appendChild(s)
    } else {
      const t = setInterval(() => { if (window.mapkit) { clearInterval(t); initMap() } }, 100)
    }
    if (wrapRef.current) ro.observe(wrapRef.current)

    return () => {
      runningRef.current = false
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
      const map = mapRef.current
      if (map) {
        map.removeEventListener("region-change-start", startLoop)
        map.removeEventListener("region-change-end", stopLoop)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function draw() {
    const map = mapRef.current
    const canvas = canvasRef.current
    if (!map || !canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const { w, h, dpr } = sizeRef.current
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = (map as any).region
    const left = mercX(r.center.longitude - r.span.longitudeDelta / 2)
    const right = mercX(r.center.longitude + r.span.longitudeDelta / 2)
    const top = mercY(r.center.latitude + r.span.latitudeDelta / 2)
    const bottom = mercY(r.center.latitude - r.span.latitudeDelta / 2)
    const sx = w / (right - left)
    const sy = h / (bottom - top)
    viewRef.current = { left, top, sx, sy }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const xs = xsRef.current
    const ys = ysRef.current
    const n = xs.length
    const m = 6
    ctx.fillStyle = "rgba(20,38,72,0.72)"
    const sz = 1.7
    const half = sz / 2
    for (let i = 0; i < n; i++) {
      const px = (xs[i] - left) * sx
      if (px < -m || px > w + m) continue
      const py = (ys[i] - top) * sy
      if (py < -m || py > h + m) continue
      ctx.fillRect(px - half, py - half, sz, sz)
    }

    const hi = hoverRef.current
    if (hi >= 0) {
      const px = (xs[hi] - left) * sx
      const py = (ys[hi] - top) * sy
      ctx.fillStyle = ACCENT
      ctx.beginPath()
      ctx.arc(px, py, 3.4, 0, 6.283)
      ctx.fill()
    }
  }

  // Selection → native pin + fly.
  useEffect(() => {
    const map = mapRef.current
    const mk = typeof window !== "undefined" ? window.mapkit : null
    if (!map || !mk || !selected) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mkAny = mk as any
    if (markerRef.current) {
      map.removeAnnotation(markerRef.current)
      markerRef.current = null
    }
    const ann = new mkAny.MarkerAnnotation(new mk.Coordinate(selected.lat, selected.lon), {
      color: ACCENT,
      title: selected.id,
      subtitle: subtitleFor(selected),
      selected: true,
    })
    map.addAnnotation(ann)
    markerRef.current = ann
    map.setCenterAnimated(new mk.Coordinate(selected.lat, selected.lon), true)
    map.cameraDistance = 130000
  }, [selected])

  // Hit-test a screen point against the dots using the current projection.
  function pick(clientX: number, clientY: number): number {
    const canvas = canvasRef.current
    const tree = treeRef.current
    if (!canvas || !tree) return -1
    const rect = canvas.getBoundingClientRect()
    const v = viewRef.current
    const mx = v.left + (clientX - rect.left) / v.sx
    const my = v.top + (clientY - rect.top) / v.sy
    const found = tree.find(mx, my, 10 / v.sx)
    return found ? found.i : -1
  }

  function onPointerDown(e: React.PointerEvent) {
    downRef.current = { x: e.clientX, y: e.clientY }
  }
  function onMove(e: React.PointerEvent) {
    const i = pick(e.clientX, e.clientY)
    if (i !== hoverRef.current) { hoverRef.current = i; if (!runningRef.current) draw() }
    const rect = wrapRef.current!.getBoundingClientRect()
    if (i >= 0) setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, id: points[i].id, st: points[i].st })
    else if (tip) setTip(null)
  }
  function onLeave() {
    if (hoverRef.current !== -1) { hoverRef.current = -1; if (!runningRef.current) draw() }
    setTip(null)
  }
  function onClick(e: React.MouseEvent) {
    const d = downRef.current
    downRef.current = null
    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return // a drag (pan), not a click
    const i = pick(e.clientX, e.clientY)
    if (i >= 0) onSelect(points[i])
  }

  return (
    <div ref={wrapRef} onPointerDown={onPointerDown} onPointerMove={onMove} onPointerLeave={onLeave} onClick={onClick} style={{ position: "absolute", inset: 0 }}>
      <div ref={mapElRef} style={{ position: "absolute", inset: 0 }} />
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
      {tip && (
        <div
          style={{
            position: "absolute",
            left: tip.x + 13,
            top: tip.y + 13,
            pointerEvents: "none",
            font: '600 12px/1 Inter, -apple-system, BlinkMacSystemFont, sans-serif',
            color: "#fff",
            background: "#1a1a1a",
            padding: "6px 9px",
            borderRadius: 7,
            whiteSpace: "nowrap",
            transform: tip.x > (wrapRef.current?.clientWidth || 9999) - 130 ? "translateX(calc(-100% - 26px))" : "none",
          }}
        >
          {tip.id} <span style={{ color: "#9aa3b2", marginLeft: 2 }}>{tip.st || "—"}</span>
        </div>
      )}
    </div>
  )
}
