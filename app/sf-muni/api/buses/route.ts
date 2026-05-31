import { transit_realtime } from "gtfs-realtime-bindings"
import type { Bus } from "@/lib/types-muni"

export const runtime = "nodejs"

const FEEDS = {
  positions: "https://api.511.org/transit/vehiclepositions",
  updates: "https://api.511.org/transit/tripupdates",
}

// 511 allows 60 requests/hour per key. Each refresh hits 2 feeds, so calls/hour
// per key = (3600/window) * 2 / numKeys. To stay <=60 we need window >= 120/numKeys.
// Default to the safe minimum for the number of keys provided; override with API_511_REFRESH.
function refreshWindow(numKeys: number): number {
  const override = Number(process.env.API_511_REFRESH)
  if (override && override > 0) return override
  return numKeys >= 2 ? 60 : 120
}

function getKeys(): string[] {
  return (process.env.API_511_KEYS ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
}

// Round-robin keys per window so load spreads evenly and no single key exceeds its cap.
function pickKey(keys: string[], window: number): string {
  const idx = Math.floor(Date.now() / 1000 / window) % keys.length
  return keys[idx]
}

async function fetchFeed(url: string, key: string, window: number): Promise<Uint8Array> {
  const res = await fetch(`${url}?api_key=${key}&agency=SF`, {
    // Cache the upstream 511 response so we never exceed the rate limit no matter
    // how many clients hit this route — only one real fetch per window.
    next: { revalidate: window },
  })
  if (!res.ok) throw new Error(`511 ${url} responded ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

// Current schedule delay for a trip: prefer the trip-level delay, else the next
// stop's arrival/departure delay (stop_time_updates are ordered by stop sequence).
function tripDelay(tu: transit_realtime.ITripUpdate): number | null {
  if (typeof tu.delay === "number") return tu.delay
  for (const stu of tu.stopTimeUpdate ?? []) {
    const d = stu.arrival?.delay ?? stu.departure?.delay
    if (typeof d === "number") return d
  }
  return null
}

export async function GET() {
  const keys = getKeys()
  if (keys.length === 0) {
    return Response.json({ error: "API_511_KEYS not configured" }, { status: 500 })
  }

  const window = refreshWindow(keys.length)
  const key = pickKey(keys, window)

  let posBuf: Uint8Array
  let updBuf: Uint8Array
  try {
    ;[posBuf, updBuf] = await Promise.all([
      fetchFeed(FEEDS.positions, key, window),
      fetchFeed(FEEDS.updates, key, window),
    ])
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 502 })
  }

  const { FeedMessage } = transit_realtime
  const positions = FeedMessage.decode(posBuf)
  const updates = FeedMessage.decode(updBuf)

  // Index delays by trip id (primary) and vehicle id (fallback).
  const delayByTrip = new Map<string, number>()
  const delayByVehicle = new Map<string, number>()
  for (const e of updates.entity) {
    const tu = e.tripUpdate
    if (!tu) continue
    const d = tripDelay(tu)
    if (d === null) continue
    if (tu.trip?.tripId) delayByTrip.set(tu.trip.tripId, d)
    if (tu.vehicle?.id) delayByVehicle.set(tu.vehicle.id, d)
  }

  const buses: Bus[] = []
  for (const e of positions.entity) {
    const v = e.vehicle
    const pos = v?.position
    if (!v || !pos || pos.latitude == null || pos.longitude == null) continue

    const tripId = v.trip?.tripId
    const vehicleId = v.vehicle?.id ?? e.id
    const delay =
      (tripId ? delayByTrip.get(tripId) : undefined) ??
      (vehicleId ? delayByVehicle.get(vehicleId) : undefined) ??
      0

    buses.push({
      id: vehicleId,
      route: v.trip?.routeId ?? "?",
      lat: Number(pos.latitude.toFixed(5)),
      lng: Number(pos.longitude.toFixed(5)),
      delay,
    })
  }

  return Response.json(
    { buses, updatedAt: Date.now() },
    {
      headers: {
        // Edge-cached for the window so every visitor reads one shared copy.
        "Cache-Control": `public, s-maxage=${window}, stale-while-revalidate=30`,
      },
    }
  )
}
