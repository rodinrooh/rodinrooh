import type { Camera, CamerasResponse } from "@/lib/types-traffic-cams"

export const runtime = "nodejs"
export const maxDuration = 30

const DISTRICT_URLS: Record<"sf" | "la", string> = {
  sf: "https://cwwp2.dot.ca.gov/data/d4/cctv/cctvStatusD04.json",
  la: "https://cwwp2.dot.ca.gov/data/d7/cctv/cctvStatusD07.json",
}

// Caltrans updates these feeds "as necessary" (no fixed cadence) and needs no
// key/rate budget, so this window is purely freshness vs. origin courtesy.
const REVALIDATE = 300

const NOT_REPORTED = "Not Reported"

function urlOrNull(v: unknown): string | null {
  return typeof v === "string" && v && v !== NOT_REPORTED ? v : null
}

interface RawCctv {
  index?: string
  inService?: string
  location?: {
    locationName?: string
    route?: string
    direction?: string
    county?: string
    nearbyPlace?: string
    latitude?: string
    longitude?: string
  }
  imageData?: {
    streamingVideoURL?: string
    static?: {
      currentImageURL?: string
      currentImageUpdateFrequency?: string
    }
  }
  recordTimestamp?: {
    recordEpoch?: string
  }
}

function shapeCamera(raw: RawCctv, city: "sf" | "la"): Camera | null {
  if (raw.inService !== "true") return null

  const videoUrl = urlOrNull(raw.imageData?.streamingVideoURL)
  const imageUrl = urlOrNull(raw.imageData?.static?.currentImageURL)
  if (!videoUrl && !imageUrl) return null

  const lat = Number(raw.location?.latitude)
  const lng = Number(raw.location?.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  const refreshSecs = Number(raw.imageData?.static?.currentImageUpdateFrequency)
  const epoch = Number(raw.recordTimestamp?.recordEpoch)

  return {
    // Caltrans's own `index` is only unique *within* a district — D4 and D7
    // both restart from 1, so ~280 ids collide between them. Prefixing with
    // city keeps camera keys globally unique, which matters a lot on the
    // client: without it, switching cities reuses stale React component
    // instances (and their fallen-back/live state) for a completely
    // different camera instead of mounting fresh ones.
    id: `${city}-${raw.index ?? `${lat},${lng}`}`,
    name: raw.location?.locationName ?? "Unknown location",
    route: raw.location?.route ?? "",
    direction: raw.location?.direction ?? "",
    county: raw.location?.county ?? "",
    nearbyPlace: raw.location?.nearbyPlace ?? "",
    lat,
    lng,
    videoUrl,
    imageUrl,
    imageRefreshMs: (Number.isFinite(refreshSecs) && refreshSecs > 0 ? refreshSecs : 5) * 1000,
    updatedAt: (Number.isFinite(epoch) ? epoch : Date.now() / 1000) * 1000,
  }
}

// Module-scoped, so it survives across requests on the same warm serverless
// instance (and for the entire process in `next dev`, where there's no CDN in
// front of the route at all — without this, every single local request pays
// the full ~5-15s Caltrans fetch+parse cost). Vercel's edge Cache-Control below
// is what shields *other* instances/visitors; this is what shields this one.
const cache = new Map<string, { body: CamerasResponse; expires: number }>()
const pending = new Map<string, Promise<CamerasResponse>>()

async function getCameras(city: "sf" | "la"): Promise<CamerasResponse> {
  const cached = cache.get(city)
  if (cached && cached.expires > Date.now()) return cached.body

  // Coalesce concurrent cold-cache requests for the same city into one
  // Caltrans fetch instead of one per request.
  const inflight = pending.get(city)
  if (inflight) return inflight

  const promise = (async () => {
    const res = await fetch(DISTRICT_URLS[city], { cache: "no-store" })
    if (!res.ok) throw new Error(`CWWP2 ${DISTRICT_URLS[city]} responded ${res.status}`)
    const buf = await res.arrayBuffer()

    const json = JSON.parse(new TextDecoder().decode(buf)) as { data?: { cctv?: RawCctv }[] }
    const cameras: Camera[] = []
    for (const entry of json.data ?? []) {
      if (!entry.cctv) continue
      const cam = shapeCamera(entry.cctv, city)
      if (cam) cameras.push(cam)
    }

    const body: CamerasResponse = { city, cameras, updatedAt: Date.now() }
    cache.set(city, { body, expires: Date.now() + REVALIDATE * 1000 })
    return body
  })()

  pending.set(city, promise)
  try {
    return await promise
  } finally {
    pending.delete(city)
  }
}

export async function GET(req: Request) {
  const cityParam = new URL(req.url).searchParams.get("city")
  const city = cityParam === "la" ? "la" : cityParam === "sf" || !cityParam ? "sf" : null
  if (!city) {
    return Response.json({ error: `invalid city "${cityParam}"` }, { status: 400 })
  }

  let body: CamerasResponse
  try {
    body = await getCameras(city)
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 502 })
  }

  return Response.json(body, {
    headers: {
      // Edge-cached for the window so every visitor reads one shared copy;
      // long stale-while-revalidate means nobody waits on Caltrans once warm.
      "Cache-Control": `public, s-maxage=${REVALIDATE}, stale-while-revalidate=3600`,
    },
  })
}
