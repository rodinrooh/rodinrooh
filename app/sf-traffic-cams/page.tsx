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

// Fixed "CCTV wall" page size — 3x3 grid.
const PAGE_SIZE = 9

// A meaningful fraction of Caltrans's own camera list is dead at any given
// moment (confirmed via a real 18-minute production observation — often
// only ~15-20% of a random sample ever reaches actual video). Slicing the
// raw camera list by array index and calling that "page N" means most pages
// are mostly empty tiles — that's not a rendering bug, it's just what the
// underlying data looks like. So pages are NOT static index slices: a
// background scanner continuously attempts connections to not-yet-tried
// cameras (mounted invisibly via the exact same CameraTile/hls.js machinery
// as a real tile — reusing the proven negotiate/watchdog logic rather than
// inventing a separate lightweight prober), and only cameras that actually
// reach "video" get appended to `discoveredLive`. "Page N" is simply the
// Nth block of 9 *confirmed-working* cameras — so a page never shows a
// structurally-dead tile, only ones that were genuinely live at some point
// (and may occasionally die again after being shown, same as any tile can).
const SCAN_CONCURRENCY = 15

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
  const page = Math.max(1, Number.isFinite(rawPage) ? rawPage : 1)

  const [cameras, setCameras] = useState<Camera[]>([])
  const [loading, setLoading] = useState(true)
  const [lastFetch, setLastFetch] = useState<number | null>(null)

  // Stable order so "which candidate gets tried next" never reshuffles
  // between the periodic refetches below — Caltrans's own JSON has no
  // meaningful order of its own.
  const sortedCameras = useMemo(
    () => [...cameras].sort((a, b) => a.id.localeCompare(b.id)),
    [cameras]
  )
  const cameraByIdRef = useRef(new Map<string, Camera>())
  cameraByIdRef.current = new Map(sortedCameras.map((c) => [c.id, c]))

  // Discovery state: cameras confirmed to have actually reached "video" at
  // least once (kept forever this session, in discovery order), cameras
  // confirmed dead (never retried this session — matches the existing
  // single-session "dead means gone" behavior of a regular tile), and
  // cameras currently being probed in the background right now.
  const [discoveredLive, setDiscoveredLive] = useState<Camera[]>([])
  const [deadIds, setDeadIds] = useState<Set<string>>(new Set())
  const [scanningIds, setScanningIds] = useState<Set<string>>(new Set())

  const discoveredIds = useMemo(() => new Set(discoveredLive.map((c) => c.id)), [discoveredLive])
  const untried = useMemo(
    () => sortedCameras.filter((c) => !discoveredIds.has(c.id) && !deadIds.has(c.id) && !scanningIds.has(c.id)),
    [sortedCameras, discoveredIds, deadIds, scanningIds]
  )
  const scanningComplete = untried.length === 0 && scanningIds.size === 0

  // Keeps the scan pool topped up to SCAN_CONCURRENCY while there aren't yet
  // enough confirmed-live cameras to cover the current page plus a one-page
  // buffer (so Next has something ready) — and stops pulling new candidates
  // once that's satisfied or the whole list has been tried.
  useEffect(() => {
    const needed = Math.min(sortedCameras.length, (page + 1) * PAGE_SIZE)
    if (discoveredLive.length >= needed) return
    const room = SCAN_CONCURRENCY - scanningIds.size
    if (room <= 0) return
    const toAdd = untried.slice(0, room)
    if (toAdd.length === 0) return
    setScanningIds((prev) => {
      const next = new Set(prev)
      toAdd.forEach((c) => next.add(c.id))
      return next
    })
  }, [sortedCameras, discoveredLive, scanningIds, untried, page])

  function goToPage(target: number) {
    router.push(`/sf-traffic-cams?city=${city}&page=${Math.max(1, target)}`, { scroll: false })
  }

  const activeCameras = discoveredLive.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const standbyDiscovered = [
    ...discoveredLive.slice((page - 2) * PAGE_SIZE, (page - 1) * PAGE_SIZE),
    ...discoveredLive.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
  ]
  const scanningCameras = sortedCameras.filter((c) => scanningIds.has(c.id))
  const windowedTiles = [
    ...standbyDiscovered.map((camera) => ({ camera, role: "standby" as const })),
    ...activeCameras.map((camera) => ({ camera, role: "active" as const })),
    ...scanningCameras.map((camera) => ({ camera, role: "standby" as const })),
  ]

  const knownPages = Math.max(1, Math.ceil(discoveredLive.length / PAGE_SIZE))
  const hasMoreAfterCurrent = discoveredLive.length > page * PAGE_SIZE || !scanningComplete
  const emptySlots = Math.max(0, PAGE_SIZE - activeCameras.length)

  const [liveOnly, setLiveOnly] = useState(false)
  const [liveCount, setLiveCount] = useState(0)
  const modesRef = useRef(new Map<string, Mode>())

  const handleModeChange = useCallback((id: string, mode: Mode) => {
    const prev = modesRef.current.get(id)
    if (prev === mode) return
    modesRef.current.set(id, mode)
    if (mode === "video" && prev !== "video") setLiveCount((n) => n + 1)
    else if (prev === "video" && mode !== "video") setLiveCount((n) => n - 1)

    // Discovery bookkeeping — this fires for every mounted tile regardless
    // of role (active, adjacent-standby, or a background scan candidate),
    // which is exactly what's needed: the first time any of them proves
    // itself live, it graduates into the permanent discoveredLive list;
    // the first time one dies, it's marked so it's never retried. Either
    // way, it must come out of scanningIds — left in, it would permanently
    // eat a scan-pool slot (nothing else would ever fill it) and, once
    // discovered, would also render as a duplicate-keyed tile alongside its
    // real active/standby slot.
    if (mode === "video") {
      setDiscoveredLive((list) => {
        if (list.some((c) => c.id === id)) return list
        const camera = cameraByIdRef.current.get(id)
        return camera ? [...list, camera] : list
      })
      setScanningIds((s) => {
        if (!s.has(id)) return s
        const next = new Set(s)
        next.delete(id)
        return next
      })
    } else if (mode === "dead") {
      setDeadIds((s) => (s.has(id) ? s : new Set(s).add(id)))
      setScanningIds((s) => {
        if (!s.has(id)) return s
        const next = new Set(s)
        next.delete(id)
        return next
      })
    }
  }, [])

  // Camera ids are unique per city (server prefixes them), so a city switch
  // means a completely fresh discovery process for the new set.
  useEffect(() => {
    modesRef.current = new Map()
    setLiveCount(0)
    setDiscoveredLive([])
    setDeadIds(new Set())
    setScanningIds(new Set())
  }, [city])

  // Detects "this camera fell out of the mount window" purely by diffing
  // what was rendered last time against what's rendered now — not by having
  // the child self-report on unmount (see the comment on CameraTile's
  // true-unmount effect for why that's unsafe: it can't be told apart from
  // React Strict Mode's dev-only phantom cleanup). A removal here is a
  // neutral bookkeeping event (clean up the live-count tally if it was
  // live) — it must NOT touch discoveredLive/deadIds, since leaving the
  // window is not a failure.
  const mountedIdsRef = useRef(new Set<string>())
  useEffect(() => {
    const currentIds = new Set(windowedTiles.map((t) => t.camera.id))
    for (const id of mountedIdsRef.current) {
      if (currentIds.has(id)) continue
      const wasMode = modesRef.current.get(id)
      modesRef.current.delete(id)
      if (wasMode === "video") setLiveCount((n) => n - 1)
    }
    mountedIdsRef.current = currentIds
  })

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
            <PageNav
              page={page}
              knownPages={knownPages}
              scanningComplete={scanningComplete}
              hasMoreAfterCurrent={hasMoreAfterCurrent}
              onGoToPage={goToPage}
            />
            <CameraGrid tiles={windowedTiles} liveOnly={liveOnly} onModeChange={handleModeChange} />
            {emptySlots > 0 && !scanningComplete && (
              <div style={{ fontSize: 13, color: "#8e8e93", marginTop: 16 }}>
                Finding live cameras… {discoveredLive.length} found so far ({scanningIds.size} checking now)
              </div>
            )}
            {emptySlots > 0 && scanningComplete && activeCameras.length === 0 && (
              <div style={{ fontSize: 13, color: "#8e8e93", marginTop: 16 }}>No live cameras on this page.</div>
            )}
          </>
        )}
      </div>

      <LastUpdated at={lastFetch} />
    </div>
  )
}

function PageNav({
  page,
  knownPages,
  scanningComplete,
  hasMoreAfterCurrent,
  onGoToPage,
}: {
  page: number
  knownPages: number
  scanningComplete: boolean
  hasMoreAfterCurrent: boolean
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
  const nextDisabled = !hasMoreAfterCurrent
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
        Page {page} of {knownPages}
        {!scanningComplete ? "+" : ""}
      </div>
      <button
        onClick={() => onGoToPage(page + 1)}
        disabled={nextDisabled}
        style={{
          ...navButtonStyle,
          opacity: nextDisabled ? 0.35 : 1,
          cursor: nextDisabled ? "default" : "pointer",
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
