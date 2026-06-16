/**
 * Direct web page fetching + paragraph extraction.
 *
 * Strategy: fetch the HTML directly (1-2s) and extract <p> tag content.
 * This is faster than Jina reader (7.9s avg) and works for the typical
 * search result pages (Wikipedia, reference sites, news) that use semantic HTML.
 *
 * Paragraph-based segmentation outperforms sentence-level and fixed-size
 * chunking for passage retrieval (BEIR benchmark, arXiv:2602.16974).
 */

const FETCH_TIMEOUT = 5_000  // 5s max per page

export type FetchResult = {
  title: string
  passages: string[]
}

const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&#160;": " ",
  "&#8211;": "–",
  "&#8212;": "—",
  "&#8216;": "'",
  "&#8217;": "'",
  "&#8220;": '"',
  "&#8221;": '"',
}

function decodeEntities(html: string): string {
  return html.replace(/&[a-z0-9#]+;/gi, m => ENTITY_MAP[m] ?? m)
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ")
}

function htmlToPassages(html: string): string[] {
  // Remove noisy sections: scripts, styles, nav, header, footer, aside
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")

  const passages: string[] = []

  // Extract from <p> tags — the primary source of paragraph content
  const pRe = /<p(?:\s[^>]*)?>(?!<)([\s\S]*?)<\/p>/gi
  let m: RegExpExecArray | null
  while ((m = pRe.exec(cleaned)) !== null) {
    const raw = stripTags(decodeEntities(m[1])).trim()
    if (raw.length > 60) passages.push(raw)
  }

  // Also extract from <dd> (definition list answers) and <li> (list items ≥ 80 chars)
  const ddRe = /<dd(?:\s[^>]*)?>(?!<)([\s\S]*?)<\/dd>/gi
  while ((m = ddRe.exec(cleaned)) !== null) {
    const raw = stripTags(decodeEntities(m[1])).trim()
    if (raw.length > 60) passages.push(raw)
  }

  const liRe = /<li(?:\s[^>]*)?>(?!<)([\s\S]*?)<\/li>/gi
  while ((m = liRe.exec(cleaned)) !== null) {
    const raw = stripTags(decodeEntities(m[1])).trim()
    if (raw.length > 80) passages.push(raw)
  }

  return passages
    .map(p => p.replace(/\s+/g, " ").trim())
    .filter(p => {
      const words = p.split(/\s+/)
      return words.length >= 15 && words.length <= 250 && /^[A-Z]/.test(p)
    })
}

function extractTitle(html: string): string {
  const m = /<title[^>]*>([^<]+)<\/title>/i.exec(html)
  return m ? decodeEntities(m[1]).replace(/\s+/g, " ").trim() : ""
}

export async function fetchPassages(url: string): Promise<FetchResult | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; notclaude-search/1.0)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    })
    if (!res.ok) return null

    const html = await res.text()
    const passages = htmlToPassages(html)
    const title = extractTitle(html)

    if (!passages.length) return null
    return { title, passages }
  } catch {
    return null
  }
}
