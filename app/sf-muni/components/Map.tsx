"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"
import type { Bus } from "@/lib/types-muni"

export interface MapHandle {
  resetView: () => void
}

interface MapProps {
  buses: Bus[]
  onSelectBus: (bus: Bus) => void
  selectedId: string | null
}

const SF_CENTER = { latitude: 37.76, longitude: -122.435 }
const SF_CAMERA = 20500
const MAPKIT_URL = "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js"

// Green → yellow → orange → red by seconds behind schedule. Early/on-time = green.
export function lateColor(delay: number): string {
  if (delay <= 60) return "#30d158"
  if (delay <= 180) return "#ffd60a"
  if (delay <= 300) return "#ff9f0a"
  return "#ff453a"
}

function dotStyle(color: string, selected: boolean): string {
  const size = selected ? 16 : 9
  return [
    `width:${size}px`,
    `height:${size}px`,
    "border-radius:50%",
    `background:${color}`,
    selected
      ? "box-shadow:0 0 0 3px rgba(255,255,255,0.9),0 0 8px rgba(0,0,0,0.5)"
      : "box-shadow:0 0 0 1px rgba(0,0,0,0.45)",
    "cursor:pointer",
    "transition:width .2s ease,height .2s ease,background-color .5s ease,box-shadow .2s ease",
  ].join(";")
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Entry = { annotation: any; el: HTMLDivElement; bus: Bus }

const Map = forwardRef<MapHandle, MapProps>(function Map({ buses, onSelectBus, selectedId }, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapkit.Map | null>(null)
  const entriesRef = useRef<globalThis.Map<string, Entry>>(new globalThis.Map())
  const busesRef = useRef<Bus[]>(buses)
  const selectedRef = useRef<string | null>(selectedId)
  const onSelectRef = useRef(onSelectBus)
  const initRef = useRef(false)
  const routesRef = useRef(false)
  // Route id → its raw polylines (arrays of [lng,lat]), for slicing local segments.
  const routeShapesRef = useRef<globalThis.Map<string, [number, number][][]>>(new globalThis.Map())
  // The bright colored segments drawn near buses; rebuilt every refresh.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const segmentsRef = useRef<any[]>([])

  useEffect(() => { onSelectRef.current = onSelectBus }, [onSelectBus])
  useEffect(() => { busesRef.current = buses }, [buses])

  // Worse lateness ranks higher and is drawn on top, so a red segment beats a
  // green one where corridors overlap.
  function severityRank(delay: number): number {
    if (delay <= 60) return 0
    if (delay <= 180) return 1
    if (delay <= 300) return 2
    return 3
  }

  // Rough meters between two [lng,lat] points (fine at city scale).
  function distM(a: [number, number], b: [number, number]): number {
    return Math.hypot((a[0] - b[0]) * 88000, (a[1] - b[1]) * 111000)
  }

  // Lateness is local: color only the stretch of route around each bus by THAT
  // bus's delay. Avoids painting whole multi-mile routes red off one late bus.
  const SEG_RADIUS_M = 220 // colored stretch each side of a bus
  const OFF_ROUTE_M = 150 // beyond this the bus isn't really on its line — skip
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function buildSegments(mk: any) {
    const map = mapRef.current
    if (!map) return
    if (segmentsRef.current.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(map as any).removeOverlays(segmentsRef.current)
      segmentsRef.current = []
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const segs: { ov: any; rank: number }[] = []
    for (const bus of busesRef.current) {
      const polylines = routeShapesRef.current.get(bus.route)
      if (!polylines) continue
      const pt: [number, number] = [bus.lng, bus.lat]

      // Nearest vertex on any of the route's polylines.
      let bestLine: [number, number][] | null = null
      let bestIdx = 0
      let bestD = Infinity
      for (const line of polylines) {
        for (let i = 0; i < line.length; i++) {
          const d = distM(pt, line[i])
          if (d < bestD) { bestD = d; bestLine = line; bestIdx = i }
        }
      }
      if (!bestLine || bestD > OFF_ROUTE_M) continue

      // Walk outward along the line ~SEG_RADIUS_M each way.
      let lo = bestIdx, hi = bestIdx, dl = 0, dr = 0
      while (lo > 0 && dl < SEG_RADIUS_M) { dl += distM(bestLine[lo], bestLine[lo - 1]); lo-- }
      while (hi < bestLine.length - 1 && dr < SEG_RADIUS_M) { dr += distM(bestLine[hi], bestLine[hi + 1]); hi++ }
      const pts = bestLine.slice(lo, hi + 1)
      if (pts.length < 2) continue

      const ov = new mk.PolylineOverlay(
        pts.map(([lng, lat]) => new mk.Coordinate(lat, lng)),
        { style: new mk.Style({ lineWidth: 3, strokeColor: lateColor(bus.delay), strokeOpacity: 0.92, lineCap: "round", lineJoin: "round" }) }
      )
      segs.push({ ov, rank: severityRank(bus.delay) })
    }

    // Red last → on top where stretches overlap.
    segs.sort((a, b) => a.rank - b.rank)
    const ovs = segs.map((s) => s.ov)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(map as any).addOverlays(ovs)
    segmentsRef.current = ovs
  }

  // Draw the full route network once as a faint base, then the colored segments.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function loadRoutes(mk: any, map: mapkit.Map) {
    if (routesRef.current) return
    routesRef.current = true
    try {
      const res = await fetch("/sf-muni-shapes.json")
      const shapes: { r: string; p: [number, number][] }[] = await res.json()
      const byRoute = routeShapesRef.current
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const base: any[] = []
      const baseStyle = new mk.Style({ lineWidth: 1, strokeColor: "#ffffff", strokeOpacity: 0.08 })
      for (const { r, p } of shapes) {
        if (!byRoute.has(r)) byRoute.set(r, [])
        byRoute.get(r)!.push(p)
        base.push(new mk.PolylineOverlay(p.map(([lng, lat]) => new mk.Coordinate(lat, lng)), { style: baseStyle }))
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(map as any).addOverlays(base)
      buildSegments(mk)
    } catch {
      routesRef.current = false // allow a retry on next sync if it failed
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function sync(mk: any, map: mapkit.Map) {
    const entries = entriesRef.current
    const seen = new Set<string>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toAdd: any[] = []

    for (const bus of busesRef.current) {
      seen.add(bus.id)
      const selected = selectedRef.current === bus.id
      const color = lateColor(bus.delay)
      const existing = entries.get(bus.id)

      if (existing) {
        // Update in place — same annotation glides to the new coordinate, no flicker.
        existing.bus = bus
        existing.annotation.coordinate = new mk.Coordinate(bus.lat, bus.lng)
        existing.el.style.cssText = dotStyle(color, selected)
        continue
      }

      const el = document.createElement("div")
      el.style.cssText = dotStyle(color, selected)
      const annotation = new mk.Annotation(
        new mk.Coordinate(bus.lat, bus.lng),
        () => el,
        { anchorOffset: new DOMPoint(0, 0), calloutEnabled: false }
      )
      const entry: Entry = { annotation, el, bus }
      el.addEventListener("click", (e) => {
        e.stopPropagation()
        onSelectRef.current(entry.bus)
      })
      entries.set(bus.id, entry)
      toAdd.push(annotation)
    }

    // Drop buses that are no longer active.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toRemove: any[] = []
    for (const [id, entry] of entries) {
      if (!seen.has(id)) {
        toRemove.push(entry.annotation)
        entries.delete(id)
      }
    }

    if (toRemove.length) map.removeAnnotations(toRemove)
    if (toAdd.length) map.addAnnotations(toAdd)
  }

  useImperativeHandle(ref, () => ({
    resetView() {
      if (!mapRef.current) return
      const mk = window.mapkit
      mapRef.current.setCenterAnimated(new mk.Coordinate(SF_CENTER.latitude, SF_CENTER.longitude), true)
      mapRef.current.cameraDistance = SF_CAMERA
    },
  }))

  // Initialize the map once.
  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    function initMap() {
      const mk = window.mapkit
      if (!mk || !containerRef.current) return

      mk.init({
        authorizationCallback: async (done: (token: string) => void) => {
          const res = await fetch("/sf-muni/api/maps-token")
          const { token } = await res.json()
          done(token)
        },
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mkAny = mk as any
      const map = new mk.Map(containerRef.current, {
        center: new mk.Coordinate(SF_CENTER.latitude, SF_CENTER.longitude),
        cameraDistance: SF_CAMERA,
        colorScheme: mkAny.Map?.ColorSchemes?.Dark ?? "dark",
        showsCompass: mk.FeatureVisibility.Hidden,
        showsZoomControl: false,
        showsMapTypeControl: false,
        showsScale: mk.FeatureVisibility.Hidden,
      })

      mapRef.current = map
      loadRoutes(mk, map)
      sync(mk, map)
    }

    if (typeof window !== "undefined" && window.mapkit) {
      initMap()
      return
    }
    if (!document.querySelector(`script[src="${MAPKIT_URL}"]`)) {
      const script = document.createElement("script")
      script.src = MAPKIT_URL
      script.async = true
      script.onload = initMap
      document.head.appendChild(script)
    } else {
      const check = setInterval(() => {
        if (window.mapkit) {
          clearInterval(check)
          initMap()
        }
      }, 100)
    }
  }, [])

  // Re-sync dots and recolor route lines whenever the bus list changes.
  useEffect(() => {
    if (mapRef.current && window.mapkit) {
      sync(window.mapkit, mapRef.current)
      if (routesRef.current) buildSegments(window.mapkit)
    }
  }, [buses])

  // Re-style only the affected dots when selection changes.
  useEffect(() => {
    selectedRef.current = selectedId
    const entries = entriesRef.current
    for (const [id, entry] of entries) {
      entry.el.style.cssText = dotStyle(lateColor(entry.bus.delay), id === selectedId)
    }
  }, [selectedId])

  return <div ref={containerRef} className="absolute inset-0" />
})

export default Map
