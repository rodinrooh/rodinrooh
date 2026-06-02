import { transit_realtime } from "gtfs-realtime-bindings"
import type { Bus } from "@/lib/types-muni"

export const runtime = "nodejs"
// 511 can take 30–60s to respond; give the (background) refresh room to finish.
export const maxDuration = 60

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

// Current schedule delay for a trip. 511's trip-level `delay` is always 0, so the
// real signal is the next stop's arrival/departure delay (stop_time_updates are
// ordered by stop sequence — the first is the next stop the bus will reach).
function tripDelay(tu: transit_realtime.ITripUpdate): number | null {
  for (const stu of tu.stopTimeUpdate ?? []) {
    const d = stu.arrival?.delay ?? stu.departure?.delay
    if (typeof d === "number") return d
  }
  if (typeof tu.delay === "number") return tu.delay
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

  // Index delay and route by trip id (the reliable join key for this feed),
  // with vehicle id as a delay fallback.
  const delayByTrip = new Map<string, number>()
  const delayByVehicle = new Map<string, number>()
  const routeByTrip = new Map<string, string>()
  for (const e of updates.entity) {
    const tu = e.tripUpdate
    if (!tu) continue
    if (tu.trip?.tripId && tu.trip.routeId) routeByTrip.set(tu.trip.tripId, tu.trip.routeId)
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

    // Only buses actually running a scheduled trip — out-of-service vehicles
    // have no route or schedule and would dilute the lateness stats.
    const tripId = v.trip?.tripId
    if (!tripId) continue

    const vehicleId = v.vehicle?.id ?? e.id
    const route = v.trip?.routeId ?? routeByTrip.get(tripId) ?? "?"
    const delay = delayByTrip.get(tripId) ?? (vehicleId ? delayByVehicle.get(vehicleId) : undefined) ?? 0

    buses.push({
      id: vehicleId,
      route,
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
        // Long stale-while-revalidate: once warm, the CDN always serves the
        // last payload instantly and refreshes in the background, so nobody
        // ever waits on a slow (30–60s) 511 response.
        "Cache-Control": `public, s-maxage=${window}, stale-while-revalidate=3600`,
      },
    }
  )
}
