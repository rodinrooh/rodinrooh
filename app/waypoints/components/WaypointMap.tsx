"use client"

import { useEffect, useRef, useState } from "react"
import { quadtree, type Quadtree } from "d3-quadtree"

export type Point = { id: string; lat: number; lon: number; st: string }

const MAPKIT_URL = "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js"
const ACCENT = "#ff9f1c"

type WNode = { i: number; x: number; y: number }

interface Props {
  points: Point[]
  wordSet: Set<string>
  selected: Point | null
  highlightWords: boolean
  onSelect: (p: Point) => void
}

// Web-Mercator world coordinates in 0..1 (matches MapKit's projection).
function mercX(lon: number) {
  return (lon + 180) / 360
}
function mercY(lat: number) {
  const s = Math.sin((lat * Math.PI) / 180)
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)
}

export default function WaypointMap({ points, wordSet, selected, highlightWords, onSelect }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const mapElRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const mapRef = useRef<mapkit.Map | null>(null)

  // Precomputed world coords (constant — independent of zoom).
  const wxRef = useRef<Float64Array>(new Float64Array(0))
  const wyRef = useRef<Float64Array>(new Float64Array(0))
  const wordRef = useRef<Uint8Array>(new Uint8Array(0))
  const treeRef = useRef<Quadtree<WNode> | null>(null)
  const idIndexRef = useRef<Map<string, number>>(new Map())

  // Current viewport projection (world→screen), updated each frame.
  const viewRef = useRef({ left: 0, top: 0, sx: 1, sy: 1 })
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 })
  const hoverRef = useRef(-1)
  const selIdxRef = useRef(-1)
  const highlightRef = useRef(highlightWords)
  const runningRef = useRef(false)
  const rafRef = useRef(0)
  const initRef = useRef(false)
  const wakeRef = useRef<(() => void) | null>(null)

  const [tip, setTip] = useState<{ x: number; y: number; id: string; st: string } | null>(null)

  useEffect(() => {
    highlightRef.current = highlightWords
    draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightWords])

  // Precompute world coords + index + quadtree once.
  useEffect(() => {
    const n = points.length
    const wx = new Float64Array(n)
    const wy = new Float64Array(n)
    const word = new Uint8Array(n)
    const idx = new Map<string, number>()
    const nodes: WNode[] = new Array(n)
    for (let i = 0; i < n; i++) {
      wx[i] = mercX(points[i].lon)
      wy[i] = mercY(points[i].lat)
      word[i] = wordSet.has(points[i].id) ? 1 : 0
      idx.set(points[i].id, i)
      nodes[i] = { i, x: wx[i], y: wy[i] }
    }
    wxRef.current = wx
    wyRef.current = wy
    wordRef.current = word
    idIndexRef.current = idx
    treeRef.current = quadtree<WNode>().x((d) => d.x).y((d) => d.y).addAll(nodes)
  }, [points, wordSet])

  // Init MapKit + overlay loop.
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
        center: new mk.Coordinate(39.5, -96),
        colorScheme: mkAny.Map?.ColorSchemes?.Dark ?? "dark",
        mapType: mkAny.Map?.MapTypes?.MutedStandard ?? "mutedStandard",
        showsCompass: mk.FeatureVisibility.Hidden,
        showsZoomControl: false,
        showsMapTypeControl: false,
        showsScale: mk.FeatureVisibility.Hidden,
        showsPointsOfInterest: false,
        isRotationEnabled: false,
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(map as any).region = new mkAny.CoordinateRegion(
        new mk.Coordinate(39.5, -96),
        new mkAny.CoordinateSpan(36, 62),
      )
      mapRef.current = map
      resize()
      draw()
      // Repaint while the map moves (covers both user gestures and fly-to).
      map.addEventListener("region-change-start", wake)
      map.addEventListener("region-change-end", wake)
    }

    // Self-settling repaint: redraw each frame until the view has been still
    // for ~450ms, then go idle — no busy-loop when nothing is moving.
    let lastKey = ""
    let stableUntil = 0
    function wake() {
      stableUntil = performance.now() + 450
      if (runningRef.current) return
      runningRef.current = true
      rafRef.current = requestAnimationFrame(tick)
    }
    function tick() {
      const map = mapRef.current
      if (map) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = (map as any).region
        const key = `${r.center.latitude},${r.center.longitude},${r.span.latitudeDelta}`
        if (key !== lastKey) {
          lastKey = key
          stableUntil = performance.now() + 450
        }
      }
      draw()
      if (performance.now() < stableUntil) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        runningRef.current = false
      }
    }
    wakeRef.current = wake

    const ro = new ResizeObserver(() => {
      resize()
      draw()
    })

    if (typeof window !== "undefined" && window.mapkit) {
      initMap()
    } else if (!document.querySelector(`script[src="${MAPKIT_URL}"]`)) {
      const s = document.createElement("script")
      s.src = MAPKIT_URL
      s.async = true
      s.onload = initMap
      document.head.appendChild(s)
    } else {
      const t = setInterval(() => {
        if (window.mapkit) {
          clearInterval(t)
          initMap()
        }
      }, 100)
    }
    if (wrapRef.current) ro.observe(wrapRef.current)

    return () => {
      runningRef.current = false
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
      const map = mapRef.current
      if (map) {
        map.removeEventListener("region-change-start", wake)
        map.removeEventListener("region-change-end", wake)
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
    const r = (map as any).region
    const cLat = r.center.latitude
    const cLon = r.center.longitude
    const latD = r.span.latitudeDelta
    const lonD = r.span.longitudeDelta

    const left = mercX(cLon - lonD / 2)
    const right = mercX(cLon + lonD / 2)
    const top = mercY(cLat + latD / 2)
    const bottom = mercY(cLat - latD / 2)
    const sx = w / (right - left)
    const sy = h / (bottom - top)
    viewRef.current = { left, top, sx, sy }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const wx = wxRef.current
    const wy = wyRef.current
    const word = wordRef.current
    const n = wx.length
    const hl = highlightRef.current
    const m = 4 // cull margin px

    // Base layer of all waypoints — small, subtle, crisp.
    ctx.fillStyle = "rgba(232,238,252,0.6)"
    const sz = 1.4
    for (let i = 0; i < n; i++) {
      if (hl && word[i]) continue
      const px = (wx[i] - left) * sx
      if (px < -m || px > w + m) continue
      const py = (wy[i] - top) * sy
      if (py < -m || py > h + m) continue
      ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz)
    }

    if (hl) {
      ctx.fillStyle = ACCENT
      const ws = 2.4
      for (let i = 0; i < n; i++) {
        if (!word[i]) continue
        const px = (wx[i] - left) * sx
        if (px < -m || px > w + m) continue
        const py = (wy[i] - top) * sy
        if (py < -m || py > h + m) continue
        ctx.beginPath()
        ctx.arc(px, py, ws / 2, 0, 6.283)
        ctx.fill()
      }
    }

    // Hover.
    const hi = hoverRef.current
    if (hi >= 0) {
      const px = (wx[hi] - left) * sx
      const py = (wy[hi] - top) * sy
      ctx.fillStyle = "#fff"
      ctx.beginPath()
      ctx.arc(px, py, 3, 0, 6.283)
      ctx.fill()
    }

    // Selected — glowing dot + ring + label.
    const si = selIdxRef.current
    if (si >= 0) {
      const px = (wx[si] - left) * sx
      const py = (wy[si] - top) * sy
      ctx.save()
      ctx.shadowColor = ACCENT
      ctx.shadowBlur = 14
      ctx.fillStyle = ACCENT
      ctx.beginPath()
      ctx.arc(px, py, 4, 0, 6.283)
      ctx.fill()
      ctx.restore()
      ctx.strokeStyle = "rgba(255,159,28,0.55)"
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.arc(px, py, 10, 0, 6.283)
      ctx.stroke()

      const label = points[si].id
      ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif'
      const tw = ctx.measureText(label).width
      const lx = Math.min(px + 14, w - tw - 18)
      const ly = Math.min(Math.max(py, 22), h - 10)
      ctx.fillStyle = "rgba(12,16,24,0.86)"
      ctx.beginPath()
      // rounded label chip
      const rx = lx - 8, ry = ly - 14, rw = tw + 16, rh = 22, rr = 6
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
    const map = mapRef.current
    const mk = typeof window !== "undefined" ? window.mapkit : null
    const idx = selected ? idIndexRef.current.get(selected.id) ?? -1 : -1
    selIdxRef.current = idx
    draw()
    if (map && mk && selected && idx >= 0) {
      map.setCenterAnimated(new mk.Coordinate(selected.lat, selected.lon), true)
      map.cameraDistance = 90000
      wakeRef.current?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  // ---- pointer ---------------------------------------------------------------
  function pick(clientX: number, clientY: number): number {
    const canvas = canvasRef.current
    const tree = treeRef.current
    if (!canvas || !tree) return -1
    const rect = canvas.getBoundingClientRect()
    const mx = clientX - rect.left
    const my = clientY - rect.top
    const v = viewRef.current
    const wx = v.left + mx / v.sx
    const wy = v.top + my / v.sy
    const rad = 13 / Math.max(v.sx, v.sy) // ~13px in world units
    const found = tree.find(wx, wy, rad)
    return found ? found.i : -1
  }

  function onMove(e: React.PointerEvent) {
    const i = pick(e.clientX, e.clientY)
    if (i !== hoverRef.current) {
      hoverRef.current = i
      draw()
    }
    const rect = canvasRef.current!.getBoundingClientRect()
    if (i >= 0) {
      setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, id: points[i].id, st: points[i].st })
    } else if (tip) setTip(null)
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
    <div
      ref={wrapRef}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      onClick={onClick}
      style={{ position: "absolute", inset: 0, background: "#0b0f17", cursor: hoverRef.current >= 0 ? "pointer" : "grab" }}
    >
      {/* Apple map handles all gestures; the canvas just paints, clicks fall through. */}
      <div ref={mapElRef} style={{ position: "absolute", inset: 0 }} />
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      />
      {tip && (
        <div
          style={{
            position: "absolute",
            left: tip.x + 14,
            top: tip.y + 14,
            pointerEvents: "none",
            font: '600 12px/1 -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
            color: "#fff",
            background: "rgba(12,16,24,.9)",
            border: "1px solid rgba(255,255,255,.14)",
            padding: "6px 9px",
            borderRadius: 7,
            whiteSpace: "nowrap",
            transform: tip.x > sizeRef.current.w - 130 ? "translateX(calc(-100% - 28px))" : "none",
          }}
        >
          {tip.id} <span style={{ color: "#8b97b6", marginLeft: 2 }}>{tip.st || "—"}</span>
        </div>
      )}
    </div>
  )
}
