"use client"

import { useEffect, useRef } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

// Clean, light, keyless basemap (OpenFreeMap — free, no API key, fully client-side).
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron"
const US_CENTER: [number, number] = [-98.5, 39.5]

export type Point = { id: string; lat: number; lon: number; st: string }

export default function Map({ selected }: { selected: Point | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markerRef = useRef<maplibregl.Marker | null>(null)
  const readyRef = useRef(false)

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: US_CENTER,
      zoom: 3.2,
      attributionControl: { compact: true },
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right")
    map.on("load", () => {
      readyRef.current = true
    })
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      readyRef.current = false
    }
  }, [])

  // Move the marker + fly whenever the selection changes.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !selected) return

    const place = () => {
      // Build a small labeled dot marker.
      const el = document.createElement("div")
      el.style.cssText = "display:flex;flex-direction:column;align-items:center;transform:translateY(-50%)"
      const label = document.createElement("div")
      label.textContent = selected.id
      label.style.cssText =
        "font:600 12px/1 -apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:.08em;" +
        "background:#111;color:#fff;padding:4px 7px;border-radius:3px;margin-bottom:5px;white-space:nowrap"
      const dot = document.createElement("div")
      dot.style.cssText =
        "width:11px;height:11px;border-radius:50%;background:#111;border:2px solid #fff;" +
        "box-shadow:0 0 0 4px rgba(17,17,17,.12)"
      el.appendChild(label)
      el.appendChild(dot)

      markerRef.current?.remove()
      markerRef.current = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([selected.lon, selected.lat])
        .addTo(map)

      map.flyTo({ center: [selected.lon, selected.lat], zoom: 8, speed: 1.1, essential: true })
    }

    if (readyRef.current) place()
    else map.once("load", place)
  }, [selected])

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
}
