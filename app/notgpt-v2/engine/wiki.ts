/**
 * Wikipedia API wrappers — search, fetch summary, fetch full article text.
 */

const UA = "notgpt-v2/1.0 (https://rodinrooh.com; rodin.roohipour@whop.com)"

export type WikiArticle = {
  title: string
  extract: string
  url: string
  description?: string
}

export async function wikiSearch(query: string, limit = 6): Promise<WikiArticle[]> {
  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: query,
    srlimit: String(limit),
    srprop: "snippet",
    format: "json",
  })
  const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
    headers: { "User-Agent": UA },
    next: { revalidate: 3600 },
  })
  if (!res.ok) return []
  const data = await res.json()
  const hits: Array<{ title: string; snippet: string }> = data?.query?.search ?? []
  return hits.map(h => ({
    title: h.title,
    extract: h.snippet.replace(/<[^>]+>/g, ""),
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(h.title)}`,
  }))
}

export async function wikiSummary(title: string): Promise<WikiArticle | null> {
  const encoded = encodeURIComponent(title)
  const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`, {
    headers: { "User-Agent": UA },
    next: { revalidate: 3600 },
  })
  if (!res.ok) return null
  const d = await res.json()
  if (d.type === "disambiguation") return null
  return {
    title: d.title ?? title,
    extract: d.extract ?? "",
    url: d.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encoded}`,
    description: d.description,
  }
}

export async function wikiFullText(title: string): Promise<string | null> {
  const params = new URLSearchParams({
    action: "query",
    titles: title,
    prop: "extracts",
    explaintext: "1",
    exsectionformat: "plain",
    format: "json",
  })
  const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
    headers: { "User-Agent": UA },
    next: { revalidate: 3600 },
  })
  if (!res.ok) return null
  const data = await res.json()
  const pages = Object.values(data?.query?.pages ?? {}) as Array<{ extract?: string }>
  return pages[0]?.extract ?? null
}

/** Split article text into overlapping ~150-word passages suitable for scoring. */
export function splitPassages(text: string, maxChars = 600): string[] {
  // Filter junk before splitting:
  // 1. Strip Wikipedia section headings ("== Section Name ==")
  // 2. Strip reference-list lines ([1] Smith et al.) and bare citation brackets
  // 3. Keep only lines that look like prose (not standalone captions/alt-text)
  const cleaned = text
    .replace(/={2,}[^=]+=+/g, "")           // == Heading ==
    .replace(/\n\[\d+\][^\n]*/g, "")         // [1] ref entries
    .replace(/\[\d+\]/g, "")                 // inline [1] markers
    .replace(/\n{3,}/g, "\n\n")              // collapse blank lines

  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(s => {
    const t = s.trim()
    if (t.length < 40) return false          // too short to be useful
    // Skip very short lines (< 40 chars already handled above)
    return true
  })

  const passages: string[] = []
  let current = ""
  for (const s of sentences) {
    if (current.length + s.length > maxChars && current) {
      passages.push(current.trim())
      const parts = current.trim().split(/(?<=[.!?])\s+/)
      current = (parts.at(-1) ?? "") + " " + s
    } else {
      current += " " + s
    }
  }
  if (current.trim()) passages.push(current.trim())
  return passages
}
