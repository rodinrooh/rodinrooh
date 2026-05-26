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

// One dot per block — most recent transaction wins
function dedupeByBlock(transactions: MeterTransaction[]): MeterTransaction[] {
  const blockMap = new globalThis.Map<string, MeterTransaction>()
  for (const tx of transactions) {
    if (!tx.lat || !tx.lng || !tx.street_block) continue
    const existing = blockMap.get(tx.street_block)
    if (!existing || tx.session_start_dt > existing.session_start_dt) {
      blockMap.set(tx.street_block, tx)
    }
  }
  return [...blockMap.values()]
}

const Map = forwardRef<MapHandle, MapProps>(function Map({ transactions, onSelectTransaction }, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapkit.Map | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const annotationsRef = useRef<globalThis.Map<string, any>>(new globalThis.Map())
  // Deduped by block, keyed by street_block
  const dedupedRef = useRef<MeterTransaction[]>([])
  const onSelectRef = useRef(onSelectTransaction)
  const initRef = useRef(false)

  useEffect(() => { onSelectRef.current = onSelectTransaction }, [onSelectTransaction])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function syncToViewport(mk: any, map: mapkit.Map) {
    const deduped = dedupedRef.current
    const existing = annotationsRef.current
    const region = map.region

    const latBuf = region.span.latitudeDelta * 0.5
    const lngBuf = region.span.longitudeDelta * 0.5
    const minLat = region.center.latitude - region.span.latitudeDelta / 2 - latBuf
    const maxLat = region.center.latitude + region.span.latitudeDelta / 2 + latBuf
    const minLng = region.center.longitude - region.span.longitudeDelta / 2 - lngBuf
    const maxLng = region.center.longitude + region.span.longitudeDelta / 2 + lngBuf

    // Which blocks are in viewport
    const inView = new globalThis.Map<string, MeterTransaction>()
    for (const tx of deduped) {
      if (tx.lat! >= minLat && tx.lat! <= maxLat && tx.lng! >= minLng && tx.lng! <= maxLng) {
        inView.set(tx.street_block!, tx)
      }
    }

    // Batch remove blocks no longer in view
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toRemove: any[] = []
    for (const [block, annotation] of existing.entries()) {
      if (!inView.has(block)) {
        toRemove.push(annotation)
        existing.delete(block)
      }
    }
    if (toRemove.length > 0) map.removeAnnotations(toRemove)

    // Batch add blocks now in view
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toAdd: any[] = []
    for (const [block, tx] of inView) {
      const existingAnnotation = existing.get(block)
      // If block already has an annotation for the same tx, skip
      if (existingAnnotation && existingAnnotation._txKey === tx.transmission_datetime) continue
      // If block has a stale annotation (newer tx came in), remove it
      if (existingAnnotation) {
        map.removeAnnotations([existingAnnotation])
        existing.delete(block)
      }

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
      annotation._txKey = tx.transmission_datetime
      toAdd.push(annotation)
      existing.set(block, annotation)
    }
    if (toAdd.length > 0) map.addAnnotations(toAdd)
  }

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
        if (window.mapkit) syncToViewport(window.mapkit, map)
      })

      mapRef.current = map
      // Initial sync once map is ready
      if (dedupedRef.current.length > 0) syncToViewport(mk, map)
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
    dedupedRef.current = dedupeByBlock(transactions)
    if (mapRef.current && window.mapkit) {
      syncToViewport(window.mapkit, mapRef.current)
    }
  }, [transactions])

  return <div ref={containerRef} className="absolute inset-0" />
})

export default Map
