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

function shapeCamera(raw: RawCctv): Camera | null {
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
    id: String(raw.index ?? `${lat},${lng}`),
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

export async function GET(req: Request) {
  const cityParam = new URL(req.url).searchParams.get("city")
  const city = cityParam === "la" ? "la" : cityParam === "sf" || !cityParam ? "sf" : null
  if (!city) {
    return Response.json({ error: `invalid city "${cityParam}"` }, { status: 400 })
  }

  let buf: ArrayBuffer
  try {
    // No `next: { revalidate }` here: the D4 feed alone is ~3.2MB, over Next's
    // 2MB fetch data-cache limit, so that cache would silently fail to store it
    // on every request. The Cache-Control header below is what actually shields
    // both Caltrans and this function from repeat traffic, at the CDN layer.
    const res = await fetch(DISTRICT_URLS[city], { cache: "no-store" })
    if (!res.ok) throw new Error(`CWWP2 ${DISTRICT_URLS[city]} responded ${res.status}`)
    buf = await res.arrayBuffer()
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 502 })
  }

  const json = JSON.parse(new TextDecoder().decode(buf)) as { data?: { cctv?: RawCctv }[] }
  const cameras: Camera[] = []
  for (const entry of json.data ?? []) {
    if (!entry.cctv) continue
    const cam = shapeCamera(entry.cctv)
    if (cam) cameras.push(cam)
  }

  const body: CamerasResponse = { city, cameras, updatedAt: Date.now() }

  return Response.json(body, {
    headers: {
      // Edge-cached for the window so every visitor reads one shared copy;
      // long stale-while-revalidate means nobody waits on Caltrans once warm.
      "Cache-Control": `public, s-maxage=${REVALIDATE}, stale-while-revalidate=3600`,
    },
  })
}
