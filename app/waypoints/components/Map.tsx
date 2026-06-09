"use client"

import { useEffect, useRef } from "react"

const MAPKIT_URL = "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js"

export type Point = { id: string; lat: number; lon: number; st: string }

// How far the camera sits above the ground (meters) when we fly to a waypoint.
// Close enough to read the terrain it floats over, wide enough to see context.
const ZOOM_DISTANCE = 14000

export default function Map({ selected }: { selected: Point | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<mapkit.Map | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef = useRef<any>(null)
  const selectedRef = useRef<Point | null>(selected)
  const initRef = useRef(false)

  useEffect(() => {
    selectedRef.current = selected
  }, [selected])

  // Build the labeled-dot annotation element for a waypoint.
  function markerEl(id: string): HTMLDivElement {
    const el = document.createElement("div")
    el.style.cssText = "display:flex;flex-direction:column;align-items:center;pointer-events:none"
    const label = document.createElement("div")
    label.textContent = id
    label.style.cssText =
      "font:600 12px/1 -apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:.1em;" +
      "background:rgba(17,17,17,.88);color:#fff;padding:4px 8px;border-radius:4px;margin-bottom:6px;" +
      "white-space:nowrap;backdrop-filter:blur(2px)"
    const dot = document.createElement("div")
    dot.style.cssText =
      "width:12px;height:12px;border-radius:50%;background:#fff;" +
      "box-shadow:0 0 0 2px #111,0 0 12px 2px rgba(255,255,255,.9)"
    el.appendChild(label)
    el.appendChild(dot)
    return el
  }

  // Drop / move the single marker and fly to it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function show(mk: any, map: mapkit.Map, p: Point, animated: boolean) {
    if (markerRef.current) {
      map.removeAnnotation(markerRef.current)
      markerRef.current = null
    }
    const ann = new mk.Annotation(new mk.Coordinate(p.lat, p.lon), () => markerEl(p.id), {
      anchorOffset: new DOMPoint(0, -6),
      calloutEnabled: false,
    })
    map.addAnnotation(ann)
    markerRef.current = ann

    const center = new mk.Coordinate(p.lat, p.lon)
    if (animated) {
      map.setCenterAnimated(center, true)
      map.cameraDistance = ZOOM_DISTANCE
    } else {
      map.center = center
      map.cameraDistance = ZOOM_DISTANCE
    }
  }

  // Initialize MapKit once.
  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    function initMap() {
      const mk = window.mapkit
      if (!mk || !containerRef.current) return

      mk.init({
        authorizationCallback: async (done: (token: string) => void) => {
          const res = await fetch("/waypoints/api/maps-token")
          const { token } = await res.json()
          done(token)
        },
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mkAny = mk as any
      const start = selectedRef.current
      const map = new mk.Map(containerRef.current, {
        center: new mk.Coordinate(start ? start.lat : 39.5, start ? start.lon : -98.5),
        cameraDistance: start ? ZOOM_DISTANCE : 6_000_000,
        mapType: mkAny.Map?.MapTypes?.Hybrid ?? "hybrid",
        showsCompass: mk.FeatureVisibility.Hidden,
        showsZoomControl: true,
        showsMapTypeControl: false,
        showsScale: mk.FeatureVisibility.Hidden,
        isRotationEnabled: false,
      })
      mapRef.current = map
      if (start) show(mk, map, start, false)
    }

    if (typeof window !== "undefined" && window.mapkit) {
      initMap()
    } else if (!document.querySelector(`script[src="${MAPKIT_URL}"]`)) {
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

  // Fly to the selection whenever it changes.
  useEffect(() => {
    const map = mapRef.current
    const mk = typeof window !== "undefined" ? window.mapkit : null
    if (!map || !mk || !selected) return
    show(mk, map, selected, true)
  }, [selected])

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
}
