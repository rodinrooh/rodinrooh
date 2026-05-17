"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"
import type { Tow } from "@/lib/types"

export interface MapHandle {
  flyTo: (lat: number, lng: number) => void
  flyToStreet: (lat: number, lng: number) => void
  resetView: () => void
}

interface MapProps {
  tows: Tow[]
  onSelectTow: (tow: Tow) => void
}

const SF_CENTER = { latitude: 37.7749, longitude: -122.4194 }
const MAPKIT_URL = "https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js"

const Map = forwardRef<MapHandle, MapProps>(function Map({ tows, onSelectTow }, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const annotationsRef = useRef<globalThis.Map<number, any>>(new globalThis.Map())
  const initRef = useRef(false)

  useImperativeHandle(ref, () => ({
    flyTo(lat: number, lng: number) {
      if (!mapRef.current) return
      const mk = window.mapkit
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mapRef.current.padding = new (mk as any).Padding({ top: 0, right: 0, bottom: 0, left: 0 })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const region = new (mk as any).CoordinateRegion(
        new mk.Coordinate(lat, lng),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        new (mk as any).CoordinateSpan(0.008, 0.008)
      )
      mapRef.current.setRegionAnimated(region, true)
    },
    flyToStreet(lat: number, lng: number) {
      if (!mapRef.current) return
      const mk = window.mapkit
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mapRef.current.padding = new (mk as any).Padding({ top: 0, right: 0, bottom: 0, left: 0 })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const region = new (mk as any).CoordinateRegion(
        new mk.Coordinate(lat, lng),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        new (mk as any).CoordinateSpan(0.02, 0.02)
      )
      mapRef.current.setRegionAnimated(region, true)
    },
    resetView() {
      if (!mapRef.current) return
      const mk = window.mapkit
      const isMobile = window.innerWidth < 768
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mapRef.current.padding = new (mk as any).Padding(
        isMobile ? { top: 0, right: 0, bottom: 180, left: 0 } : { top: 0, right: 0, bottom: 0, left: 320 }
      )
      mapRef.current.setCenterAnimated(new mk.Coordinate(SF_CENTER.latitude, SF_CENTER.longitude), true)
      mapRef.current.cameraDistance = 20000
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
          const res = await fetch("/sf-towing/api/maps-token")
          const { token } = await res.json()
          done(token)
        },
      })

      const map = new mk.Map(containerRef.current, {
        center: new mk.Coordinate(SF_CENTER.latitude, SF_CENTER.longitude),
        cameraDistance: 20000,
        showsCompass: mk.FeatureVisibility.Adaptive,
        showsZoomControl: true,
        showsMapTypeControl: false,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        padding: new (mk as any).Padding(
          window.innerWidth < 768
            ? { top: 0, right: 0, bottom: 180, left: 0 }
            : { top: 0, right: 0, bottom: 0, left: 320 }
        ),
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
    const currentIds = new Set(tows.filter((t) => t.lat && t.lng).map((t) => t.vehicle_id))

    for (const [vid, annotation] of existing.entries()) {
      if (!currentIds.has(vid)) {
        map.removeAnnotation(annotation)
        existing.delete(vid)
      }
    }

    for (const tow of tows) {
      if (!tow.lat || !tow.lng) continue
      if (existing.has(tow.vehicle_id)) continue

      const initials = (tow.make ?? "??").slice(0, 2).toUpperCase()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const annotation = new (mk as any).Annotation(
        new mk.Coordinate(tow.lat, tow.lng),
        () => {
          const el = document.createElement("div")
          el.textContent = initials
          el.style.cssText = `
            width:44px;height:44px;border-radius:50%;
            background:linear-gradient(145deg,#adb2be,#717585);
            color:#fff;
            display:flex;align-items:center;justify-content:center;
            font-size:16px;
            font-weight:350;
            font-family:-apple-system,BlinkMacSystemFont,sans-serif;
            letter-spacing:.5px;
            border:2px solid #fff;
            box-shadow:0 2px 8px rgba(0,0,0,.25);
            cursor:pointer;
          `
          el.addEventListener("click", (e) => {
            e.stopPropagation()
            onSelectTow(tow)
          })
          return el
        },
        { anchorOffset: new DOMPoint(0, 0), calloutEnabled: false }
      )
      map.addAnnotation(annotation)
      existing.set(tow.vehicle_id, annotation)
    }
  }, [tows, onSelectTow])

  return <div ref={containerRef} className="absolute inset-0" />
})

export default Map
