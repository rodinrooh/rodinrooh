"use client"

export const dynamic = "force-dynamic"

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { Camera, CamerasResponse } from "@/lib/types-traffic-cams"
import CameraGrid from "./components/CameraGrid"
import CityToggle from "./components/CityToggle"
import type { Mode } from "./components/CameraTile"

type City = "sf" | "la"

// Camera metadata (location, inService) barely changes minute to minute —
// unlike sf-muni's bus positions, there's no need to poll aggressively.
const POLL_VISIBLE = 600_000
const POLL_HIDDEN = 1_800_000

// Fixed "CCTV wall" page size — 3x3 grid. Only the current page's tiles
// actually play; the immediate previous/next page are kept mounted as a
// paused prefetch (see CameraTile's `role` prop) so paging feels instant
// without ever running more than ~3 pages worth of connections at once.
const PAGE_SIZE = 9

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
  const rawPage = parseInt(searchParams.get("page") ?? "1", 10)

  const [cameras, setCameras] = useState<Camera[]>([])
  const [loading, setLoading] = useState(true)
  const [lastFetch, setLastFetch] = useState<number | null>(null)

  // Stable order so page boundaries never reshuffle between the periodic
  // refetches below — Caltrans's own JSON has no meaningful order.
  const sortedCameras = useMemo(
    () => [...cameras].sort((a, b) => a.id.localeCompare(b.id)),
    [cameras]
  )
  const totalPages = Math.max(1, Math.ceil(sortedCameras.length / PAGE_SIZE))
  const page = Math.min(Math.max(1, Number.isFinite(rawPage) ? rawPage : 1), totalPages)

  function goToPage(target: number) {
    const clamped = Math.min(Math.max(1, target), totalPages)
    router.push(`/sf-traffic-cams?city=${city}&page=${clamped}`, { scroll: false })
  }

  const currentSlice = sortedCameras.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const prevSlice = page > 1 ? sortedCameras.slice((page - 2) * PAGE_SIZE, (page - 1) * PAGE_SIZE) : []
  const nextSlice = page < totalPages ? sortedCameras.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : []
  const windowedTiles = [
    ...prevSlice.map((camera) => ({ camera, role: "standby" as const })),
    ...currentSlice.map((camera) => ({ camera, role: "active" as const })),
    ...nextSlice.map((camera) => ({ camera, role: "standby" as const })),
  ]

  const [liveOnly, setLiveOnly] = useState(false)
  const [liveCount, setLiveCount] = useState(0)
  const modesRef = useRef(new Map<string, Mode>())

  const handleModeChange = useCallback((id: string, mode: Mode) => {
    const prev = modesRef.current.get(id)
    if (prev === mode) return
    modesRef.current.set(id, mode)
    if (mode === "video" && prev !== "video") setLiveCount((n) => n + 1)
    else if (prev === "video" && mode !== "video") setLiveCount((n) => n - 1)
  }, [])

  // Camera ids are unique per city (server prefixes them), so a city switch
  // mounts a fresh set of tiles — reset the tally rather than let it carry
  // over stale counts from the previous city's cameras.
  useEffect(() => {
    modesRef.current = new Map()
    setLiveCount(0)
  }, [city])

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

      <button
        onClick={() => setLiveOnly((v) => !v)}
        style={{
          position: "absolute",
          top: "max(16px, env(safe-area-inset-top))",
          right: 16,
          padding: "7px 12px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.1)",
          background: liveOnly ? "rgba(61,220,99,0.16)" : "rgba(18,18,20,0.72)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          color: liveOnly ? "#3ddc63" : "#fff",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.02em",
          cursor: "pointer",
          boxShadow: "0 8px 40px rgba(0,0,0,0.45)",
          zIndex: 1,
        }}
      >
        {liveOnly ? `LIVE ONLY (${liveCount})` : "LIVE ONLY"}
      </button>

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "76px 16px 48px" }}>
        {loading && cameras.length === 0 ? (
          <div style={{ fontSize: 14, color: "#8e8e93" }}>Loading cameras…</div>
        ) : (
          <>
            <PageNav page={page} totalPages={totalPages} onGoToPage={goToPage} />
            <CameraGrid tiles={windowedTiles} liveOnly={liveOnly} onModeChange={handleModeChange} />
          </>
        )}
      </div>

      <LastUpdated at={lastFetch} />
    </div>
  )
}

function PageNav({
  page,
  totalPages,
  onGoToPage,
}: {
  page: number
  totalPages: number
  onGoToPage: (page: number) => void
}) {
  const navButtonStyle = {
    padding: "7px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(18,18,20,0.72)",
    color: "#fff",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
      <button
        onClick={() => onGoToPage(page - 1)}
        disabled={page <= 1}
        style={{ ...navButtonStyle, opacity: page <= 1 ? 0.35 : 1, cursor: page <= 1 ? "default" : "pointer" }}
      >
        ← Prev
      </button>
      <div style={{ fontSize: 12, color: "#8e8e93", fontVariantNumeric: "tabular-nums" }}>
        Page {page} of {totalPages}
      </div>
      <button
        onClick={() => onGoToPage(page + 1)}
        disabled={page >= totalPages}
        style={{
          ...navButtonStyle,
          opacity: page >= totalPages ? 0.35 : 1,
          cursor: page >= totalPages ? "default" : "pointer",
        }}
      >
        Next →
      </button>
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
