"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import type { Tow } from "@/lib/types"

interface LeaderboardProps {
  tows: Tow[]
  onFlyToStreet?: (lat: number, lng: number) => void
}

interface CountEntry { label: string; count: number }

function weekStart(): string {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay())
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function groupBy(tows: Tow[], key: (t: Tow) => string | null): CountEntry[] {
  const counts: Record<string, number> = {}
  for (const t of tows) {
    const k = key(t)
    if (k) counts[k] = (counts[k] ?? 0) + 1
  }
  return Object.entries(counts).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
}

function extractStreet(address: string | null): string | null {
  if (!address) return null
  const m = address.match(/^\d+\s+(.+)/)
  return m ? m[1] : address
}

function hourLabel(h: number): string {
  if (h === 0) return "12am"
  if (h < 12) return `${h}am`
  if (h === 12) return "12pm"
  return `${h - 12}pm`
}

function buildHourlyData(tows: Tow[]): { hour: number; count: number }[] {
  const counts = new Array(24).fill(0)
  for (const t of tows) {
    const h = new Date(t.towed_at).toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Los_Angeles" })
    counts[parseInt(h, 10) % 24]++
  }
  return counts.map((count, hour) => ({ hour, count }))
}

function sfDateString(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })
}

export default function Leaderboard({ tows, onFlyToStreet }: LeaderboardProps) {
  const [allTimeCount, setAllTimeCount] = useState<number | null>(null)
  const [weekCount, setWeekCount] = useState<number | null>(null)

  useEffect(() => {
    async function fetchCounts() {
      const [allRes, weekRes] = await Promise.all([
        supabase.from("tows").select("*", { count: "exact", head: true }),
        supabase.from("tows").select("*", { count: "exact", head: true }).gte("towed_at", weekStart()),
      ])
      setAllTimeCount(allRes.count ?? null)
      setWeekCount(weekRes.count ?? null)
    }
    fetchCounts()
  }, [])

  const todayStr = sfDateString(new Date())
  const todayTows = tows.filter((t) => sfDateString(new Date(t.towed_at)) === todayStr)

  const neighborhoods = groupBy(tows, (t) => extractStreet(t.towed_from)).slice(0, 10)
  const makes = groupBy(tows, (t) => t.make).slice(0, 7)
  const reasons = groupBy(tows, (t) => t.reason).slice(0, 5)
  const hourlyData = buildHourlyData(tows)
  const maxHourCount = Math.max(...hourlyData.map((h) => h.count), 1)

  return (
    <div className="overflow-y-auto flex-1 px-4 py-4 space-y-6">
      <div className="grid grid-cols-3 gap-2">
        <StatBox label="Today" value={todayTows.length} />
        <StatBox label="This week" value={weekCount} />
        <StatBox label="All time" value={allTimeCount} />
      </div>
      <section>
        <h3 className="text-xs font-semibold text-[#8e8e93] uppercase tracking-wide mb-2">Most towed streets</h3>
        {neighborhoods.length === 0 ? (
          <div className="text-sm text-[#8e8e93]">No data yet</div>
        ) : (
          <div className="space-y-1">
            {neighborhoods.map(({ label, count }, i) => {
              const streetTows = tows.filter((t) => extractStreet(t.towed_from) === label && t.lat && t.lng)
              const centroid = streetTows.length > 0 ? {
                lat: streetTows.reduce((s, t) => s + t.lat!, 0) / streetTows.length,
                lng: streetTows.reduce((s, t) => s + t.lng!, 0) / streetTows.length,
              } : null
              return (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-xs text-[#8e8e93] w-4">{i + 1}</span>
                  {centroid && onFlyToStreet ? (
                    <button onClick={() => onFlyToStreet(centroid.lat, centroid.lng)} className="flex-1 text-sm text-[#007aff] truncate text-left underline">
                      {label}
                    </button>
                  ) : (
                    <div className="flex-1 text-sm text-[#1c1c1e] truncate">{label}</div>
                  )}
                  <span className="text-xs font-semibold text-[#8e8e93]">{count}</span>
                </div>
              )
            })}
          </div>
        )}
      </section>
      <section>
        <h3 className="text-xs font-semibold text-[#8e8e93] uppercase tracking-wide mb-2">Top reasons</h3>
        {reasons.length === 0 ? (
          <div className="text-sm text-[#8e8e93]">No data yet</div>
        ) : (
          <div className="space-y-1">
            {reasons.map(({ label, count }) => (
              <div key={label} className="flex items-center gap-2">
                <div className="flex-1 text-sm text-[#1c1c1e] truncate">{label}</div>
                <span className="text-xs font-semibold text-[#8e8e93]">{count}</span>
              </div>
            ))}
          </div>
        )}
      </section>
      <section>
        <h3 className="text-xs font-semibold text-[#8e8e93] uppercase tracking-wide mb-3">Busiest hours</h3>
        <div className="flex items-end gap-0.5 h-16">
          {hourlyData.map(({ hour, count }) => (
            <div key={hour} className="flex flex-col items-center flex-1 gap-0.5">
              <div
                className="w-full rounded-sm transition-all"
                style={{ height: `${Math.round((count / maxHourCount) * 52)}px`, minHeight: count > 0 ? 4 : 0, background: "#007aff", opacity: count > 0 ? 1 : 0.15 }}
              />
              {hour % 6 === 0 && <span className="text-[8px] text-[#c7c7cc]">{hourLabel(hour)}</span>}
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3 className="text-xs font-semibold text-[#8e8e93] uppercase tracking-wide mb-2">Most towed makes</h3>
        {makes.length === 0 ? (
          <div className="text-sm text-[#8e8e93]">No data yet</div>
        ) : (
          <div className="space-y-1.5">
            {makes.map(({ label, count }, i) => {
              const pct = Math.round((count / makes[0].count) * 100)
              return (
                <div key={label}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs text-[#8e8e93] w-4">{i + 1}</span>
                    <div className="flex-1 text-sm text-[#1c1c1e] truncate">{label}</div>
                    <span className="text-xs font-semibold text-[#8e8e93]">{count}</span>
                  </div>
                  <div className="ml-6 h-1 rounded-full bg-[#e5e5ea] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "#007aff", opacity: 0.6 }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="bg-[#f2f2f7] rounded-xl px-3 py-2 text-center">
      <div className="text-lg font-bold text-[#1c1c1e]">{value === null ? "—" : value.toLocaleString()}</div>
      <div className="text-xs text-[#8e8e93]">{label}</div>
    </div>
  )
}
