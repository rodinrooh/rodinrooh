"use client"

export const dynamic = "force-dynamic"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { Camera, CamerasResponse } from "@/lib/types-traffic-cams"
import CameraGrid from "./components/CameraGrid"
import CityToggle from "./components/CityToggle"

type City = "sf" | "la"

// Camera metadata (location, inService) barely changes minute to minute —
// unlike sf-muni's bus positions, there's no need to poll aggressively.
const POLL_VISIBLE = 600_000
const POLL_HIDDEN = 1_800_000

export default function SFTrafficCamsPage() {
  return (
    <Suspense fallback={null}>
      <TrafficCamsPageInner />
    </Suspense>
  )
}

function TrafficCamsPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const city: City = searchParams.get("city") === "la" ? "la" : "sf"

  const [cameras, setCameras] = useState<Camera[]>([])
  const [loading, setLoading] = useState(true)
  const [lastFetch, setLastFetch] = useState<number | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    let cancelled = false

    async function load() {
      try {
        const res = await fetch(`/sf-traffic-cams/api/cameras?city=${city}`, { cache: "no-store" })
        if (!res.ok) return
        const data: CamerasResponse = await res.json()
        if (!cancelled) {
          setCameras(data.cameras)
          setLastFetch(Date.now())
        }
      } catch {
        // keep last good data on a transient failure
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    async function tick() {
      await load()
      if (cancelled) return
      timer = setTimeout(tick, document.hidden ? POLL_HIDDEN : POLL_VISIBLE)
    }

    function onVisibility() {
      if (!document.hidden) {
        clearTimeout(timer)
        tick()
      }
    }

    setLoading(true)
    tick()
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [city])

  return (
    <div
      style={{
        position: "relative",
        minHeight: "100svh",
        width: "100%",
        background: "#08080a",
        boxSizing: "border-box",
      }}
    >
      <CityToggle
        city={city}
        onChange={(next) => router.push(`/sf-traffic-cams?city=${next}`, { scroll: false })}
      />

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "76px 16px 48px" }}>
        {loading && cameras.length === 0 ? (
          <div style={{ fontSize: 14, color: "#8e8e93" }}>Loading cameras…</div>
        ) : (
          <CameraGrid cameras={cameras} />
        )}
      </div>

      <LastUpdated at={lastFetch} />
    </div>
  )
}

function LastUpdated({ at }: { at: number | null }) {
  const [, force] = useState(0)
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])
  if (!at) return null
  const secs = Math.max(0, Math.round((Date.now() - at) / 1000))
  return (
    <div
      style={{
        position: "fixed",
        bottom: "max(10px, env(safe-area-inset-bottom))",
        right: 12,
        padding: "5px 9px",
        borderRadius: 8,
        background: "rgba(18,18,20,0.7)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.08)",
        color: "#8e8e93",
        fontSize: 11,
        letterSpacing: "0.02em",
        fontVariantNumeric: "tabular-nums",
        pointerEvents: "none",
      }}
    >
      updated {secs}s ago
    </div>
  )
}
