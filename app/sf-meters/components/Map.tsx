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
  // Fast lookup map keyed by transmission_datetime for viewport sync
  const txMapRef = useRef<globalThis.Map<string, MeterTransaction>>(new globalThis.Map())
  const onSelectRef = useRef(onSelectTransaction)
  const initRef = useRef(false)

  useEffect(() => { onSelectRef.current = onSelectTransaction }, [onSelectTransaction])

  // Sync annotations to only what's in the current viewport + 50% buffer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const syncToViewport = useRef((mk: any, map: any) => {
    const txMap = txMapRef.current
    const existing = annotationsRef.current
    const region = map.region

    const latBuf = region.span.latitudeDelta * 0.5
    const lngBuf = region.span.longitudeDelta * 0.5
    const minLat = region.center.latitude - region.span.latitudeDelta / 2 - latBuf
    const maxLat = region.center.latitude + region.span.latitudeDelta / 2 + latBuf
    const minLng = region.center.longitude - region.span.longitudeDelta / 2 - lngBuf
    const maxLng = region.center.longitude + region.span.longitudeDelta / 2 + lngBuf

    const shouldShow = new Set<string>()
    for (const [key, tx] of txMap) {
      if (tx.lat! >= minLat && tx.lat! <= maxLat && tx.lng! >= minLng && tx.lng! <= maxLng) {
        shouldShow.add(key)
      }
    }

    // Batch remove out-of-viewport annotations
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toRemove: any[] = []
    for (const [key, annotation] of existing.entries()) {
      if (!shouldShow.has(key)) {
        toRemove.push(annotation)
        existing.delete(key)
      }
    }
    if (toRemove.length > 0) map.removeAnnotations(toRemove)

    // Batch add in-viewport annotations not yet rendered
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toAdd: any[] = []
    for (const key of shouldShow) {
      if (existing.has(key)) continue
      const tx = txMap.get(key)!
      const color = dotColor(Number(tx.gross_paid_amt))
      const txCapture = tx

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const annotation = new (mk as any).Annotation(
        new mk.Coordinate(tx.lat, tx.lng),
        () => {
          const el = document.createElement("div")
          el.style.cssText = `width:12px;height:12px;border-radius:50%;background:${color};border:2px solid #fff;cursor:pointer;`
          el.addEventListener("click", (e) => {
            e.stopPropagation()
            onSelectRef.current(txCapture)
          })
          return el
        },
        { anchorOffset: new DOMPoint(0, 0), calloutEnabled: false }
      )
      toAdd.push(annotation)
      existing.set(key, annotation)
    }
    if (toAdd.length > 0) map.addAnnotations(toAdd)
  })

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

      map.addEventListener("region-change-complete", () => {
        if (window.mapkit) syncToViewport.current(window.mapkit, map)
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

  // When transactions change, update the lookup map and re-sync to viewport
  useEffect(() => {
    txMapRef.current = new globalThis.Map(
      transactions.filter(t => t.lat && t.lng).map(t => [t.transmission_datetime, t])
    )
    if (mapRef.current && window.mapkit) {
      syncToViewport.current(window.mapkit, mapRef.current)
    }
  }, [transactions])

  return <div ref={containerRef} className="absolute inset-0" />
})

export default Map
