"use client"

import { useEffect, useRef, useState } from "react"
import { quadtree, type Quadtree } from "d3-quadtree"

export type Point = { id: string; lat: number; lon: number; st: string }

const MAPKIT_URL = "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js"
const ACCENT = "#e5484d"

type WNode = { i: number; x: number; y: number }

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
  const mapRef = useRef<mapkit.Map | null>(null)
  const treeRef = useRef<Quadtree<WNode> | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef = useRef<any>(null)
  const idIndexRef = useRef<Map<string, number>>(new Map())
  const initRef = useRef(false)
  const [tip, setTip] = useState<{ x: number; y: number; id: string; st: string } | null>(null)

  useEffect(() => {
    const idx = new Map<string, number>()
    for (let i = 0; i < points.length; i++) idx.set(points[i].id, i)
    idIndexRef.current = idx
  }, [points])

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

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
      buildOverlay(mkAny, map)
    }

    // Bake all 69k dots into one image MapKit pans/zooms natively (no per-frame work).
    // Project through MapKit's own toMapPoint so the image + rect share its exact projection.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function buildOverlay(mkAny: any, map: mapkit.Map) {
      const n = points.length
      const xs = new Float64Array(n)
      const ys = new Float64Array(n)
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      const nodes: WNode[] = new Array(n)
      for (let i = 0; i < n; i++) {
        const mp = new mkAny.Coordinate(points[i].lat, points[i].lon).toMapPoint()
        const x = mp.x, y = mp.y
        xs[i] = x; ys[i] = y
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
        nodes[i] = { i, x, y }
      }
      treeRef.current = quadtree<WNode>().x((d) => d.x).y((d) => d.y).addAll(nodes)

      const rwRaw = maxX - minX
      const pad = rwRaw * 0.01
      minX -= pad; maxX += pad; minY -= pad; maxY += pad
      const rw = maxX - minX
      const rh = maxY - minY
      const imgW = 3072
      const imgH = Math.round((imgW * rh) / rw)
      const cv = document.createElement("canvas")
      cv.width = imgW
      cv.height = imgH
      const ctx = cv.getContext("2d")!
      ctx.fillStyle = "rgba(22,40,74,0.72)"
      const r = 2.4
      for (let i = 0; i < n; i++) {
        const px = ((xs[i] - minX) / rw) * imgW
        const py = ((ys[i] - minY) / rh) * imgH
        ctx.beginPath()
        ctx.arc(px, py, r, 0, 6.283)
        ctx.fill()
      }
      const url = cv.toDataURL("image/png")
      const rect = new mkAny.MapRect(minX, minY, rw, rh)
      const overlay = new mkAny.ImageOverlay(url, { rect })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(map as any).addOverlay(overlay)
    }

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
  }, [])

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

  // Hit-test a screen point against the dots via MapKit's projection.
  function pick(clientX: number, clientY: number): number {
    const map = mapRef.current
    const mk = typeof window !== "undefined" ? window.mapkit : null
    const tree = treeRef.current
    if (!map || !mk || !tree) return -1
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mkAny = mk as any
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = map as any
      const c0 = m.convertPointOnPageToCoordinate(new DOMPoint(clientX, clientY))
      const c1 = m.convertPointOnPageToCoordinate(new DOMPoint(clientX + 10, clientY))
      const p0 = new mkAny.Coordinate(c0.latitude, c0.longitude).toMapPoint()
      const p1 = new mkAny.Coordinate(c1.latitude, c1.longitude).toMapPoint()
      const perPx = Math.abs(p1.x - p0.x) / 10 || 1e-9
      const found = tree.find(p0.x, p0.y, 12 * perPx)
      return found ? found.i : -1
    } catch {
      return -1
    }
  }

  function onMove(e: React.PointerEvent) {
    const i = pick(e.clientX, e.clientY)
    const rect = wrapRef.current!.getBoundingClientRect()
    if (i >= 0) setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, id: points[i].id, st: points[i].st })
    else if (tip) setTip(null)
  }
  function onLeave() {
    if (tip) setTip(null)
  }
  function onClick(e: React.MouseEvent) {
    const i = pick(e.clientX, e.clientY)
    if (i >= 0) onSelect(points[i])
  }

  return (
    <div ref={wrapRef} onPointerMove={onMove} onPointerLeave={onLeave} onClick={onClick} style={{ position: "absolute", inset: 0 }}>
      <div ref={mapElRef} style={{ position: "absolute", inset: 0 }} />
      {tip && (
        <div
          style={{
            position: "absolute",
            left: tip.x + 13,
            top: tip.y + 13,
            pointerEvents: "none",
            font: '600 12px/1 -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
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
