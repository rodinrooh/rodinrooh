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
  // Route id → its polyline overlays, so we can recolor a whole route at once.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const routeOverlaysRef = useRef<globalThis.Map<string, any[]>>(new globalThis.Map())
  // Flat list of every route overlay tagged with its route, for severity z-ordering.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flatOverlaysRef = useRef<{ ov: any; route: string }[]>([])

  useEffect(() => { onSelectRef.current = onSelectBus }, [onSelectBus])
  useEffect(() => { busesRef.current = buses }, [buses])

  // Median live delay of the buses currently on a route (null if none active).
  // Median resists the occasional glitched 90-min outlier an average would chase.
  function routeMedianDelay(route: string): number | null {
    const ds = busesRef.current.filter((b) => b.route === route).map((b) => b.delay)
    if (ds.length === 0) return null
    ds.sort((a, b) => a - b)
    const m = Math.floor(ds.length / 2)
    return ds.length % 2 ? ds[m] : (ds[m - 1] + ds[m]) / 2
  }

  // Worse lateness ranks higher and gets drawn on top, so where corridors
  // overlap a late (red) route wins over an on-time (green) one. -1 = no buses.
  function severityRank(d: number | null): number {
    if (d === null) return -1
    if (d <= 60) return 0
    if (d <= 180) return 1
    if (d <= 300) return 2
    return 3
  }

  // Color each route by its live lateness, then z-order so the worst sits on
  // top. Routes with no active buses recede to a barely-there gray.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function colorRoutes(mk: any) {
    const map = mapRef.current
    if (!map) return
    const rankByRoute = new globalThis.Map<string, number>()
    for (const [route, overlays] of routeOverlaysRef.current) {
      const d = routeMedianDelay(route)
      rankByRoute.set(route, severityRank(d))
      const style =
        d === null
          ? new mk.Style({ lineWidth: 1, strokeColor: "#ffffff", strokeOpacity: 0.07 })
          : new mk.Style({ lineWidth: 2.2, strokeColor: lateColor(d), strokeOpacity: 0.75 })
      for (const o of overlays) o.style = style
    }

    // Re-stack only when the current draw order no longer keeps the worst on top.
    const flat = flatOverlaysRef.current
    let ordered = true
    for (let i = 1; i < flat.length; i++) {
      if (rankByRoute.get(flat[i].route)! < rankByRoute.get(flat[i - 1].route)!) { ordered = false; break }
    }
    if (!ordered) {
      const sorted = [...flat].sort((a, b) => rankByRoute.get(a.route)! - rankByRoute.get(b.route)!)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(map as any).removeOverlays(flat.map((x) => x.ov))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(map as any).addOverlays(sorted.map((x) => x.ov))
      flatOverlaysRef.current = sorted
    }
  }

  // Draw the Muni route shapes once beneath the dots, then color them live.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function loadRoutes(mk: any, map: mapkit.Map) {
    if (routesRef.current) return
    routesRef.current = true
    try {
      const res = await fetch("/sf-muni-shapes.json")
      const shapes: { r: string; p: [number, number][] }[] = await res.json()
      const grouped = routeOverlaysRef.current
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const flat: { ov: any; route: string }[] = []
      for (const { r, p } of shapes) {
        const ov = new mk.PolylineOverlay(p.map(([lng, lat]) => new mk.Coordinate(lat, lng)), {})
        if (!grouped.has(r)) grouped.set(r, [])
        grouped.get(r)!.push(ov)
        flat.push({ ov, route: r })
      }
      flatOverlaysRef.current = flat
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(map as any).addOverlays(flat.map((x) => x.ov))
      colorRoutes(mk)
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
      if (routesRef.current) colorRoutes(window.mapkit)
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
