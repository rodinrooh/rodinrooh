"use client"

export const dynamic = "force-dynamic"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Bus, BusesResponse } from "@/lib/types-muni"
import Map, { lateColor, type MapHandle } from "./components/Map"
import StatsOverlay from "./components/StatsOverlay"
import WelcomeModal from "./components/WelcomeModal"

const POLL_VISIBLE = 45_000
const POLL_HIDDEN = 300_000

export default function SFMuniPage() {
  const [buses, setBuses] = useState<Bus[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showInfo, setShowInfo] = useState(false)
  const [lastFetch, setLastFetch] = useState<number | null>(null)
  const mapRef = useRef<MapHandle>(null)

  // Poll the cached endpoint. Slows to 5 min when the tab is hidden, snaps back
  // to a fresh fetch the moment it's visible again — keeps the API budget light.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    let cancelled = false

    async function load() {
      try {
        // no-store so each poll gets the current CDN copy instead of a stale
        // browser-cached one — the server/edge cache still shields the 511 API.
        const res = await fetch("/sf-muni/api/buses", { cache: "no-store" })
        if (!res.ok) return
        const data: BusesResponse = await res.json()
        if (!cancelled) {
          setBuses(data.buses)
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

    tick()
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])

  const stats = useMemo(() => {
    const total = buses.length
    if (total === 0) return { latePct: 0, totalDelayMin: 0, total: 0 }
    const late = buses.filter((b) => b.delay > 60).length
    // Sum of every bus's lateness right now, in minutes — the live "delay debt".
    const lateSeconds = buses.reduce((s, b) => s + Math.max(0, b.delay), 0)
    return {
      latePct: Math.round((late / total) * 100),
      totalDelayMin: Math.round(lateSeconds / 60),
      total,
    }
  }, [buses])

  const handleSelect = useCallback((bus: Bus) => setSelectedId(bus.id), [])

  const selectedBus = useMemo(
    () => buses.find((b) => b.id === selectedId) ?? null,
    [buses, selectedId]
  )

  return (
    <div
      style={{
        position: "relative",
        height: "100svh",
        width: "100%",
        background: "#08080a",
        padding: "clamp(8px, 1.4vw, 18px)",
        boxSizing: "border-box",
      }}
    >
      {/* Framed map — inset from the screen edges with a rounded border */}
      <div
        style={{
          position: "relative",
          height: "100%",
          width: "100%",
          borderRadius: "clamp(14px, 1.6vw, 22px)",
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 12px 48px rgba(0,0,0,0.55)",
        }}
      >
        <Map ref={mapRef} buses={buses} onSelectBus={handleSelect} selectedId={selectedId} />

        <StatsOverlay latePct={stats.latePct} totalDelayMin={stats.totalDelayMin} total={stats.total} loading={loading} />

        {/* Info button — reopens the welcome modal */}
        <button
          onClick={() => setShowInfo(true)}
          aria-label="About this map"
          style={{
            position: "absolute",
            top: "max(16px, env(safe-area-inset-top))",
            right: 16,
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(18,18,20,0.72)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            color: "#fff",
            fontSize: 16,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 8px 40px rgba(0,0,0,0.45)",
          }}
        >
          i
        </button>

        {selectedBus && <BusCard bus={selectedBus} onClose={() => setSelectedId(null)} />}

        <LastUpdated at={lastFetch} />
      </div>

      <WelcomeModal />
      {showInfo && <WelcomeModal open onClose={() => setShowInfo(false)} />}
    </div>
  )
}

// Small debug ticker: seconds since the last successful poll.
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
        position: "absolute",
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

function BusCard({ bus, onClose }: { bus: Bus; onClose: () => void }) {
  const min = Math.round(bus.delay / 60)
  const status =
    bus.delay > 60 ? `${min} min late` : bus.delay < -60 ? `${Math.abs(min)} min early` : "On time"
  const color = lateColor(bus.delay)

  return (
    <div
      style={{
        position: "absolute",
        bottom: "max(20px, env(safe-area-inset-bottom))",
        left: "50%",
        transform: "translateX(-50%)",
        width: "calc(100% - 32px)",
        maxWidth: 300,
        padding: "14px 16px",
        borderRadius: 16,
        background: "rgba(18,18,20,0.82)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      <div style={{ width: 12, height: 12, borderRadius: "50%", background: color, flexShrink: 0, boxShadow: `0 0 8px ${color}` }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1 }}>Route {bus.route}</div>
        <div style={{ fontSize: 13, color: "#a1a1a6", marginTop: 2, letterSpacing: "-0.005em" }}>{status}</div>
      </div>
      <button
        onClick={onClose}
        aria-label="Close"
        style={{ background: "none", border: "none", color: "#8e8e93", fontSize: 20, cursor: "pointer", lineHeight: 1, padding: 4 }}
      >
        ×
      </button>
    </div>
  )
}
