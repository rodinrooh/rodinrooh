import { WIKIMEDIA_UA } from "./wikipedia"

export type DDGAnswer = {
  heading: string
  abstractText: string
  abstractURL: string
  wikiTitle: string | null
}

// DuckDuckGo Instant Answer API — free, no auth, server-side only.
// Returns the Wikipedia article DDG associates with a query, bypassing Wikipedia's BM25.
// Key use: vocabulary gap ("why does sand squeak" → "Singing sand", "ground steam after rain" → "Petrichor")
export async function fetchDDGAnswer(query: string): Promise<DDGAnswer | null> {
  const params = new URLSearchParams({
    q: query,
    format: "json",
    no_html: "1",
    skip_disambig: "1",
  })
  try {
    const res = await fetch(`https://api.duckduckgo.com/?${params}`, {
      headers: { "User-Agent": WIKIMEDIA_UA },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null
    const data = await res.json()

    const heading: string = data?.Heading ?? ""
    const abstractText: string = data?.AbstractText ?? ""
    const abstractURL: string = data?.AbstractURL ?? ""
    const type: string = data?.Type ?? ""

    // Only use definitive article results ("A") with actual content
    if (type !== "A" || !heading || !abstractText) return null

    // Extract Wikipedia article title from URL
    let wikiTitle: string | null = null
    const wikiMatch = abstractURL.match(/en\.wikipedia\.org\/wiki\/(.+)$/)
    if (wikiMatch) {
      wikiTitle = decodeURIComponent(wikiMatch[1].replace(/_/g, " "))
    }

    return { heading, abstractText, abstractURL, wikiTitle }
  } catch {
    return null
  }
}
