"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"
import type { MeterTransaction } from "@/lib/types-meters"

export interface MapHandle {
  flyTo: (lat: number, lng: number) => void
  resetView: () => void
}

interface MapProps {
  transactions: MeterTransaction[]
  onSelectTransaction: (tx: MeterTransaction) => void
}

const SF_CENTER = { latitude: 37.762, longitude: -122.438 }
const MAPKIT_URL = "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js"

function dotColor(amount: number): string {
  if (amount < 3) return "#FFF9C4"
  if (amount < 8) return "#FFCC80"
  if (amount < 14) return "#FFA726"
  if (amount < 24) return "#EF6C00"
  return "#BF360C"
}

const Map = forwardRef<MapHandle, MapProps>(function Map({ transactions, onSelectTransaction }, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const annotationsRef = useRef<globalThis.Map<string, any>>(new globalThis.Map())
  const initRef = useRef(false)

  useImperativeHandle(ref, () => ({
    flyTo(lat: number, lng: number) {
      if (!mapRef.current) return
      const mk = window.mapkit
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const region = new (mk as any).CoordinateRegion(
        new mk.Coordinate(lat, lng),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        new (mk as any).CoordinateSpan(0.005, 0.005)
      )
      mapRef.current.setRegionAnimated(region, true)
    },
    resetView() {
      if (!mapRef.current) return
      const mk = window.mapkit
      mapRef.current.setCenterAnimated(new mk.Coordinate(SF_CENTER.latitude, SF_CENTER.longitude), true)
      mapRef.current.cameraDistance = 15000
    },
  }))

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    function initMap() {
      const mk = window.mapkit
      if (!mk || !containerRef.current) return

      mk.init({
        authorizationCallback: async (done: (token: string) => void) => {
          const res = await fetch("/sf-meters/api/maps-token")
          const { token } = await res.json()
          done(token)
        },
      })

      const map = new mk.Map(containerRef.current, {
        center: new mk.Coordinate(SF_CENTER.latitude, SF_CENTER.longitude),
        cameraDistance: 15000,
        showsCompass: mk.FeatureVisibility.Adaptive,
        showsZoomControl: true,
        showsMapTypeControl: false,
      })

      mapRef.current = map
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

  useEffect(() => {
    if (!mapRef.current) return
    const mk = window.mapkit
    if (!mk) return

    const map = mapRef.current
    const existing = annotationsRef.current
    const currentKeys = new Set(
      transactions.filter((t) => t.lat && t.lng).map((t) => t.transmission_datetime)
    )

    for (const [key, annotation] of existing.entries()) {
      if (!currentKeys.has(key)) {
        map.removeAnnotation(annotation)
        existing.delete(key)
      }
    }

    for (const tx of transactions) {
      if (!tx.lat || !tx.lng) continue
      if (existing.has(tx.transmission_datetime)) continue

      const color = dotColor(Number(tx.gross_paid_amt))
      const txCapture = tx

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const annotation = new (mk as any).Annotation(
        new mk.Coordinate(tx.lat, tx.lng),
        () => {
          const el = document.createElement("div")
          el.style.cssText = `
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background: ${color};
            border: 2px solid #fff;
            cursor: pointer;
            transition: transform 0.12s;
          `
          el.addEventListener("mouseenter", () => { el.style.transform = "scale(1.4)" })
          el.addEventListener("mouseleave", () => { el.style.transform = "scale(1)" })
          el.addEventListener("click", (e) => {
            e.stopPropagation()
            onSelectTransaction(txCapture)
          })
          return el
        },
        { anchorOffset: new DOMPoint(0, 0), calloutEnabled: false }
      )
      map.addAnnotation(annotation)
      existing.set(tx.transmission_datetime, annotation)
    }
  }, [transactions, onSelectTransaction])

  return <div ref={containerRef} className="absolute inset-0" />
})

export default Map
