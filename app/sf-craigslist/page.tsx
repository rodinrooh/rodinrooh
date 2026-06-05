export const dynamic = "force-dynamic"

const FEED_URL =
  "https://sapi.craigslist.org/web/v8/postings/search/full?batch=1-0-360-0-0&cc=US&lang=en&searchPath=zip"

type Item = {
  id: number
  title: string
  neighborhood: string
  postedAt: number
  imageUrl: string | null
  url: string
}

// Craigslist's search API returns compact positional arrays plus a `decode`
// lookup table. Per item: [0]=postingId offset, [1]=postedDate offset,
// [4]="subareaIdx:neighborhoodIdx:...~lat~lon", tagged sub-arrays where
// [4, ...] = image ids and [6, slug] = url slug, last element = title.
function decodeItems(json: unknown): Item[] {
  const data = (json as { data?: { items?: unknown[]; decode?: Record<string, unknown> } })?.data
  const dec = data?.decode as
    | {
        minPostingId: number
        minPostedDate: number
        locationDescriptions: unknown[]
        locations: unknown[]
      }
    | undefined
  if (!Array.isArray(data?.items) || !dec) return []

  const items: Item[] = []
  for (const raw of data.items) {
    if (!Array.isArray(raw) || typeof raw[0] !== "number" || typeof raw[1] !== "number") continue
    const title = raw[raw.length - 1]
    if (typeof title !== "string" || !title) continue

    const id = dec.minPostingId + raw[0]
    const postedAt = (dec.minPostedDate + raw[1]) * 1000

    const locParts = typeof raw[4] === "string" ? raw[4].split("~")[0].split(":") : []
    const subareaIdx = parseInt(locParts[0] ?? "0", 10) || 0
    const neighborhoodIdx = parseInt(locParts[1] ?? "0", 10) || 0
    const neighborhoodEntry = dec.locationDescriptions[neighborhoodIdx]
    const neighborhood = typeof neighborhoodEntry === "string" ? neighborhoodEntry : ""
    const subareaEntry = dec.locations[subareaIdx]
    const subarea = Array.isArray(subareaEntry) && typeof subareaEntry[2] === "string" ? subareaEntry[2] : ""

    let imageUrl: string | null = null
    let slug = ""
    for (const el of raw) {
      if (!Array.isArray(el)) continue
      if (el[0] === 4 && typeof el[1] === "string") {
        imageUrl = `https://images.craigslist.org/${el[1].replace(/^\d+:/, "")}_600x450.jpg`
      } else if (el[0] === 6 && typeof el[1] === "string") {
        slug = el[1]
      }
    }

    const url = `https://sfbay.craigslist.org/${subarea ? `${subarea}/` : ""}zip/d/${slug}/${id}.html`
    items.push({ id, title, neighborhood, postedAt, imageUrl, url })
  }
  return items.sort((a, b) => b.postedAt - a.postedAt)
}

function timeAgo(postedAt: number, now: number): string {
  const mins = Math.max(0, Math.floor((now - postedAt) / 60000))
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

async function getItems(): Promise<Item[]> {
  try {
    const res = await fetch(FEED_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Referer: "https://sfbay.craigslist.org/",
      },
      next: { revalidate: 300 },
    })
    if (!res.ok) return []
    return decodeItems(await res.json())
  } catch {
    return []
  }
}

export default async function Freelist() {
  const items = await getItems()
  const now = Date.now()

  return (
    <div style={{ background: "#fff", minHeight: "100vh", color: "#000" }}>
      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "48px 24px 96px" }}>
        <h1 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 48px" }}>Freelist</h1>

        {items.length === 0 ? (
          <div style={{ fontSize: 14, color: "#888" }}>Feed unavailable.</div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: "40px 24px",
            }}
          >
            {items.map((it) => (
              <a
                key={it.id}
                href={it.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "block", textDecoration: "none", color: "inherit" }}
              >
                {it.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.imageUrl}
                    alt={it.title}
                    loading="lazy"
                    style={{
                      width: "100%",
                      aspectRatio: "4 / 3",
                      objectFit: "cover",
                      display: "block",
                      background: "#f5f5f5",
                    }}
                  />
                ) : (
                  <div style={{ width: "100%", aspectRatio: "4 / 3", background: "#f5f5f5" }} />
                )}
                <div style={{ fontSize: 15, lineHeight: 1.4, margin: "10px 0 2px" }}>{it.title}</div>
                <div style={{ fontSize: 13, color: "#888" }}>
                  {it.neighborhood ? `${it.neighborhood} · ` : ""}
                  {timeAgo(it.postedAt, now)}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
