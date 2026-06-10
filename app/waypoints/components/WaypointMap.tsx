"use client"

import { useEffect, useRef, useState } from "react"
import maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

export type Point = { id: string; lat: number; lon: number; st: string }

// Clean, free, keyless street-map style (roads, water, labels — a normal map).
const STYLE = "https://tiles.openfreemap.org/styles/liberty"
const ACCENT = "#e5484d"

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
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const popupRef = useRef<maplibregl.Popup | null>(null)
  const onSelectRef = useRef(onSelect)
  const [tip, setTip] = useState<{ x: number; y: number; id: string; st: string } | null>(null)

  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center: [-96, 39.5],
      zoom: 3.4,
      attributionControl: { compact: true },
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right")
    mapRef.current = map

    map.on("load", () => {
      const fc = {
        type: "FeatureCollection",
        features: points.map((p) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [p.lon, p.lat] },
          properties: { id: p.id, st: p.st },
        })),
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.addSource("wp", { type: "geojson", data: fc as any })
      map.addLayer({
        id: "wp",
        type: "circle",
        source: "wp",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 1, 5, 1.6, 8, 2.6, 12, 4.2],
          "circle-color": "#15294d",
          "circle-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0.55, 8, 0.85],
        },
      })
      map.addSource("sel", { type: "geojson", data: { type: "FeatureCollection", features: [] } })
      map.addLayer({
        id: "sel",
        type: "circle",
        source: "sel",
        paint: {
          "circle-radius": 7,
          "circle-color": ACCENT,
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#fff",
        },
      })

      map.on("mousemove", "wp", (e) => {
        map.getCanvas().style.cursor = "pointer"
        const f = e.features?.[0]
        if (f) setTip({ x: e.point.x, y: e.point.y, id: f.properties!.id, st: f.properties!.st })
      })
      map.on("mouseleave", "wp", () => {
        map.getCanvas().style.cursor = ""
        setTip(null)
      })
      map.on("click", "wp", (e) => {
        const f = e.features?.[0]
        if (!f) return
        const c = (f.geometry as GeoJSON.Point).coordinates
        onSelectRef.current({ id: f.properties!.id, lon: c[0], lat: c[1], st: f.properties!.st })
      })
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Selection → highlight + popup + fly.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !selected) return
    const apply = () => {
      const src = map.getSource("sel") as maplibregl.GeoJSONSource | undefined
      if (!src) return
      src.setData({
        type: "FeatureCollection",
        features: [{ type: "Feature", geometry: { type: "Point", coordinates: [selected.lon, selected.lat] }, properties: {} }],
      })
      popupRef.current?.remove()
      popupRef.current = new maplibregl.Popup({ closeButton: false, offset: 14, className: "wp-popup" })
        .setLngLat([selected.lon, selected.lat])
        .setHTML(`<div class="wp-pop-id">${selected.id}</div><div class="wp-pop-sub">${subtitleFor(selected)}</div>`)
        .addTo(map)
      map.flyTo({ center: [selected.lon, selected.lat], zoom: 8.5, speed: 1.2, essential: true })
    }
    if (map.isStyleLoaded() && map.getSource("sel")) apply()
    else map.once("idle", apply)
  }, [selected])

  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0 }}>
      {tip && (
        <div
          style={{
            position: "absolute",
            left: tip.x + 13,
            top: tip.y + 13,
            pointerEvents: "none",
            zIndex: 2,
            font: '600 12px/1 Inter, -apple-system, BlinkMacSystemFont, sans-serif',
            color: "#fff",
            background: "#1a1a1a",
            padding: "6px 9px",
            borderRadius: 7,
            whiteSpace: "nowrap",
            transform: tip.x > (containerRef.current?.clientWidth || 9999) - 130 ? "translateX(calc(-100% - 26px))" : "none",
          }}
        >
          {tip.id} <span style={{ color: "#9aa3b2", marginLeft: 2 }}>{tip.st || "—"}</span>
        </div>
      )}
    </div>
  )
}
