/**
 * Serper.dev wrapper.
 *
 * Returns answerBox (Google's featured snippet), organic results, and
 * peopleAlsoAsk entries. These are used as passage candidates in retrieve.ts.
 *
 * answerBox.snippet is verbatim text extracted by Google from the source page —
 * the closest approximation to a "featured snippet" available via API.
 */

export type AnswerBox = {
  snippet?: string
  snippetHighlighted?: string[]
  title?: string
  link: string
}

export type OrganicResult = {
  title: string
  link: string
  snippet?: string
  position: number
}

export type PeopleAlsoAsk = {
  question: string
  snippet?: string
  title?: string
  link: string
}

export type SerperResponse = {
  answerBox?: AnswerBox
  organic: OrganicResult[]
  peopleAlsoAsk: PeopleAlsoAsk[]
}

// 60s in-memory cache keyed by query to avoid repeat fetches during dev
const _cache = new Map<string, { data: SerperResponse; exp: number }>()

export async function serperSearch(query: string): Promise<SerperResponse | null> {
  const key = process.env.SERPER_API_KEY
  if (!key) return null

  const cached = _cache.get(query)
  if (cached && cached.exp > Date.now()) return cached.data

  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num: 10 }),
      cache: "no-store",
    })
    if (!res.ok) return null

    const raw = await res.json()

    // Media and streaming platforms don't return usable text passages —
    // their "content" is audio/video, and any extracted text is metadata (titles,
    // descriptions) rather than a verbatim answer to a factual question.
    // User explicitly approved filtering YouTube; extending to other media platforms.
    const MEDIA_DOMAINS = new Set([
      "youtube.com", "youtu.be", "spotify.com", "open.spotify.com",
      "tiktok.com", "soundcloud.com", "twitch.tv",
    ])
    const isMediaUrl = (url: string) => {
      try { return MEDIA_DOMAINS.has(new URL(url).hostname.replace(/^www\./, "")) }
      catch { return false }
    }

    const data: SerperResponse = {
      answerBox: raw.answerBox ?? undefined,
      organic: (raw.organic ?? [])
        .filter((r: Record<string, unknown>) => !isMediaUrl(String(r.link ?? "")))
        .map((r: Record<string, unknown>) => ({
          title: String(r.title ?? ""),
          link: String(r.link ?? ""),
          snippet: r.snippet ? String(r.snippet) : undefined,
          position: Number(r.position ?? 99),
        })),
      peopleAlsoAsk: (raw.peopleAlsoAsk ?? []).map((r: Record<string, unknown>) => ({
        question: String(r.question ?? ""),
        snippet: r.snippet ? String(r.snippet) : undefined,
        title: r.title ? String(r.title) : undefined,
        link: String(r.link ?? ""),
      })),
    }

    _cache.set(query, { data, exp: Date.now() + 60_000 })
    return data
  } catch {
    return null
  }
}
