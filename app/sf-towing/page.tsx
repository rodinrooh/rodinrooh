"use client"

export const dynamic = "force-dynamic"

import { useCallback, useRef, useState } from "react"
import LeftPanel from "./components/LeftPanel"
import Map, { type MapHandle } from "./components/Map"
import DetailCard from "./components/DetailCard"
import WelcomeModal from "./components/WelcomeModal"
import { useTows, sfDateString } from "@/lib/useTows"
import type { Tow } from "@/lib/types"

export default function Home() {
  const { tows, loading, todayCount } = useTows()
  const [selectedTow, setSelectedTow] = useState<Tow | null>(null)
  const [todayOnly, setTodayOnly] = useState(false)
  const mapRef = useRef<MapHandle>(null)

  const todayStr = sfDateString(new Date())
  const displayTows = todayOnly
    ? tows.filter((t) => sfDateString(new Date(t.towed_at)) === todayStr)
    : tows

  const handleSelectTow = useCallback(
    (tow: Tow) => {
      setSelectedTow(tow)
      if (tow.lat && tow.lng) {
        mapRef.current?.flyTo(tow.lat, tow.lng)
      }
    },
    []
  )

  const handleFlyToStreet = useCallback((lat: number, lng: number) => {
    mapRef.current?.flyToStreet(lat, lng)
  }, [])

  return (
    <div className="relative h-full w-full">
      <Map ref={mapRef} tows={displayTows} onSelectTow={handleSelectTow} />
      <LeftPanel
        tows={displayTows}
        loading={loading}
        selectedId={selectedTow?.vehicle_id ?? null}
        onSelect={handleSelectTow}
        onFlyToStreet={handleFlyToStreet}
      />
      {selectedTow && (
        <DetailCard tow={selectedTow} onClose={() => setSelectedTow(null)} />
      )}
      <WelcomeModal />

      {/* Today toggle */}
      <div className="absolute top-4 right-4 z-20 hidden md:flex items-center gap-2">
        <button
          onClick={() => setTodayOnly(!todayOnly)}
          className="px-3 py-1.5 rounded-full text-[12px] font-semibold transition-colors"
          style={{
            background: todayOnly ? "#007aff" : "rgba(255,255,255,0.82)",
            color: todayOnly ? "#fff" : "#1c1c1e",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(0,0,0,0.1)",
          }}
        >
          {todayOnly ? `Today (${todayCount})` : "All time"}
        </button>
      </div>
    </div>
  )
}
