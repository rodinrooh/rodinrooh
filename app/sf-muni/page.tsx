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
  const mapRef = useRef<MapHandle>(null)

  // Poll the cached endpoint. Slows to 5 min when the tab is hidden, snaps back
  // to a fresh fetch the moment it's visible again — keeps the API budget light.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    let cancelled = false

    async function load() {
      try {
        const res = await fetch("/sf-muni/api/buses")
        if (!res.ok) return
        const data: BusesResponse = await res.json()
        if (!cancelled) setBuses(data.buses)
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
    if (total === 0) return { latePct: 0, avgDelayMin: 0, total: 0 }
    const late = buses.filter((b) => b.delay > 60).length
    const avgDelaySec = buses.reduce((s, b) => s + b.delay, 0) / total
    return {
      latePct: Math.round((late / total) * 100),
      avgDelayMin: Math.max(0, avgDelaySec / 60),
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
        background: "#f2f2f5",
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
          border: "1px solid rgba(0,0,0,0.1)",
          boxShadow: "0 10px 40px rgba(0,0,0,0.18)",
        }}
      >
        <Map ref={mapRef} buses={buses} onSelectBus={handleSelect} selectedId={selectedId} />

        <StatsOverlay latePct={stats.latePct} avgDelayMin={stats.avgDelayMin} total={stats.total} loading={loading} />

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
            border: "1px solid rgba(0,0,0,0.08)",
            background: "rgba(255,255,255,0.88)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            color: "#1c1c1e",
            fontSize: 16,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 6px 24px rgba(0,0,0,0.18)",
          }}
        >
          i
        </button>

        {selectedBus && <BusCard bus={selectedBus} onClose={() => setSelectedId(null)} />}
      </div>

      <WelcomeModal />
      {showInfo && <WelcomeModal open onClose={() => setShowInfo(false)} />}
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
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: "1px solid rgba(0,0,0,0.08)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        color: "#1c1c1e",
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      <div style={{ width: 12, height: 12, borderRadius: "50%", background: color, flexShrink: 0, boxShadow: `0 0 8px ${color}` }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1 }}>Route {bus.route}</div>
        <div style={{ fontSize: 13, color: "#6b6b70", marginTop: 2, letterSpacing: "-0.005em" }}>{status}</div>
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
