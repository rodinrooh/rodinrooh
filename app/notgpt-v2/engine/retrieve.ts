/**
 * Candidate retrieval: gather Wikipedia articles from multiple sources,
 * then rank passages by semantic similarity.
 *
 * Key insight from empirical testing:
 *  • Wikipedia BM25 works BEST with LONG queries — "sand makes noise squeaking
 *    walking beach" finds "Singing sand" (first result); "sand squeak" finds nothing.
 *  • DDG works only on exact article names, not casual questions.
 *  • Wikipedia OpenSearch bridges redirects (e.g., "dawn chorus" → "Dawn chorus (birds)").
 *
 * Strategy: generate both SHORT and LONG Wikipedia search queries to maximize
 * the chance that the right article appears somewhere in the candidate pool.
 * The embedding model then picks the best passage — no word lists needed.
 */

import { wikiSearch, wikiSummary, wikiFullText, splitPassages, WikiArticle } from "./wiki"
import { rankPassages } from "./embed"

const UA = "notgpt-v2/1.0 (https://rodinrooh.com)"

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nlp = require("compromise") as (text: string) => {
  nouns: () => { out: (fmt: "array") => string[] }
  verbs: () => { out: (fmt: "array") => string[] }
}

// ─── Query variant generation ────────────────────────────────────────────────

function generateQueryVariants(query: string): { ddg: string[]; wiki: string[] } {
  const qLow = query.trim().toLowerCase().replace(/[?!.,]+$/, "")

  // Strip question scaffold
  const stripped = qLow
    .replace(/^(?:why|how|what|who|when|where|which)\s+(?:do|does|did|is|are|was|were|can|could)?\s*/i, "")
    .replace(/\b(?:you|i|we|they|he|she|it|your|my|our|the|a|an)\b\s*/g, "")
    .replace(/\s+/g, " ").trim()

  let nouns: string[] = []
  let verbs: string[] = []
  try {
    const doc = nlp(query)
    nouns = doc.nouns().out("array")
      .map((n: string) => n.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim())
      .filter((n: string) => n.length > 2)
    verbs = doc.verbs().out("array")
      .map((v: string) => v.toLowerCase().replace(/[^a-z]/g, "").trim())
      .filter((v: string) => v.length > 3 && !["does","have","make","gets","been","took","want","lets"].includes(v))
  } catch { /* nlp failure is not fatal */ }

  // ── DDG queries: short noun-phrase forms ──
  // DDG works only on exact article names — try multiple noun-phrase angles
  const ddgSet = new Set<string>()
  for (const n of nouns.slice(0, 3)) {
    ddgSet.add(n)
    const split = splitCompound(n)
    if (split) ddgSet.add(split)
  }
  // noun + key verb: "sand squeak", "sand squeaking"
  for (const noun of nouns.slice(0, 2)) {
    for (const verb of verbs.slice(0, 2)) {
      if (verb !== noun) {
        ddgSet.add(`${noun} ${verb}`)
        const gerund = verb.replace(/e$/, "") + "ing"
        ddgSet.add(`${gerund} ${noun}`)  // "squeaking sand" → DDG might have it
        ddgSet.add(`${noun} ${gerund}`)  // "sand squeaking"
      }
    }
  }

  // ── Wikipedia queries: LONG forms work better ──
  // Empirically: "sand makes noise squeaking walking beach" finds "Singing sand";
  // "sand squeak" finds nothing. Include MORE words, not fewer.
  const wikiSet = new Set<string>()

  // 1. Original question (Wikipedia handles natural language well)
  wikiSet.add(query)

  // 2. Stripped but NOT shortened: keep as many contextual words as possible
  wikiSet.add(stripped)

  // 3. COMPACT query: noun + first verb + gerunds of all verbs (NO stopwords/connectors)
  //    Empirically: "sand squeak squeaking walking" finds "Singing sand" on Wikipedia.
  //    The full stripped form ("sand squeak when walk on squeaking walking") does NOT.
  if (nouns[0] && verbs.length > 0) {
    const gerunds = verbs.slice(0, 3).map(v => v.replace(/e$/, "") + "ing")
    wikiSet.add(`${nouns[0]} ${verbs[0]} ${gerunds.join(" ")}`.trim())
    // gerund-first variant: "squeaking sand walking"
    if (gerunds[0]) wikiSet.add(`${gerunds[0]} ${nouns[0]} ${gerunds.slice(1).join(" ")}`.trim())
  }

  // 4. Stripped + first gerund (medium-length form)
  if (verbs[0]) {
    const gerund = verbs[0].replace(/e$/, "") + "ing"
    wikiSet.add(`${stripped} ${gerund}`.trim())
  }

  return {
    ddg: [...ddgSet].filter(s => s.length > 2).slice(0, 8),
    wiki: [...wikiSet].filter(s => s.length > 2).slice(0, 6),
  }
}

function splitCompound(word: string): string | null {
  const prefixes = ["goose","thunder","sun","rain","earth","fire","over","under","out","back",
    "hand","eye","head","heart","blood","bone","brain","skin","hair","foot",
    "home","house","door","car","air","sea","land","light","dark"]
  for (const p of prefixes) {
    if (word.startsWith(p) && word.length > p.length + 2) return `${p} ${word.slice(p.length)}`
  }
  return null
}

// ─── Source fetchers ──────────────────────────────────────────────────────────

async function ddgForPhrase(phrase: string): Promise<WikiArticle | null> {
  try {
    const params = new URLSearchParams({ q: phrase, format: "json", no_html: "1", skip_disambig: "1" })
    const res = await fetch(`https://api.duckduckgo.com/?${params}`, {
      headers: { "User-Agent": UA },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null
    const d = await res.json()
    if (d.Type !== "A" || !d.AbstractText || !d.AbstractURL) return null
    const m = (d.AbstractURL as string).match(/en\.wikipedia\.org\/wiki\/(.+)$/)
    if (!m) return null
    const title = decodeURIComponent(m[1].replace(/_/g, " "))
    return { title, extract: d.AbstractText, url: d.AbstractURL, description: d.Heading }
  } catch { return null }
}

async function wikiOpenSearch(query: string): Promise<string[]> {
  const params = new URLSearchParams({
    action: "opensearch", search: query, limit: "5", redirects: "resolve", format: "json",
  })
  try {
    const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
      headers: { "User-Agent": UA },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data[1] as string[]) ?? []
  } catch { return [] }
}

// ─── Serper: Google search scoped to Wikipedia ────────────────────────────────
// This is the primary fix for vocabulary-gap failures. Google's semantic index
// knows "sand squeak walking" → "Singing sand", "birds morning" → "Dawn chorus",
// "glass fog up" → "Anti-fog / Condensation", etc. BM25, DDG, and OpenSearch
// cannot bridge these gaps. Serper returns Google results as JSON (no scraping).
// Fails silently if key missing — existing pipeline continues unchanged.

type SerperResult = { title: string; snippet: string; url: string }

// Returns article titles AND Google-selected snippets.
// Snippets are critical: for "sand squeak", Google's snippet says "caused by walking on the sand" —
// this scores high against the query. BM25 passage scoring misses this because the
// Singing sand article lede says "sand that produces sound" (zero exact match for "squeak").
async function serperSearch(query: string): Promise<SerperResult[]> {
  const apiKey = process.env.SERPER_API_KEY
  if (!apiKey) return []
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: `${query} site:en.wikipedia.org`, num: 5 }),
      next: { revalidate: 3600 },
    })
    if (!res.ok) return []
    const data = await res.json()
    const results: SerperResult[] = []
    for (const r of (data.organic ?? []) as Array<{ link?: string; snippet?: string }>) {
      if (!r.link) continue
      const m = r.link.match(/en\.wikipedia\.org\/wiki\/(.+)$/)
      if (!m) continue
      const title = decodeURIComponent(m[1].replace(/_/g, " "))
      if (title.startsWith("Wikipedia:") || title.startsWith("Talk:") ||
          title.startsWith("List of") || title.includes("(disambiguation)")) continue
      results.push({ title, snippet: r.snippet ?? "", url: r.link })
    }
    return results.slice(0, 5)
  } catch { return [] }
}

// ─── Main retrieval ──────────────────────────────────────────────────────────

export type RetrievalResult = {
  passage: string
  articleTitle: string
  articleUrl: string
  score: number
}

export async function retrieveBestPassage(query: string): Promise<RetrievalResult | null> {
  const { ddg: ddgQueries, wiki: wikiQueries } = generateQueryVariants(query)

  const seen = new Set<string>()
  const candidates: WikiArticle[] = []

  // Is the query ABOUT language/grammar? If so, allow grammar articles through.
  // "what is a pronoun" should return the pronoun article; "what happens if you swallow gum" should not.
  const queryIsAboutLanguage = /\b(pronoun|grammar|preposition|conjunction|determiner|syntax|linguistics|language|english word|parts of speech)\b/i.test(query)

  const add = (a: WikiArticle | null) => {
    if (!a?.extract || seen.has(a.title)) return
    if (a.title.startsWith("Talk:") || a.title.startsWith("Wikipedia:") ||
        a.title.startsWith("User:") || a.title.startsWith("Template:")) return

    // Structurally detect articles that won't answer mechanism questions.
    // Two structural patterns (not word lists):
    // 1. Grammar/linguistic meta-articles: their descriptions say "pronoun", "grammar" etc.
    // 2. Media/entertainment content: Wikipedia uses "studio album", "debut single", "TV series"
    //    as standardized structural description terms — not genre enumerations.
    if (!queryIsAboutLanguage) {
      const isOffTopic = /\b(pronoun|preposition|determiner|conjunction|grammatical|linguistics?|English word|English language|studio album|debut album|extended play|compilation album|live album|single by|music video|television series|TV series|animated series|video game|board game|role.playing game)\b/i
        .test(a.description ?? "")
      if (isOffTopic) return

      // Structurally detect entertainment articles via Wikipedia's own disambiguation markers.
      // "Hold Your Breath (2024 film)" → year+film pattern; "Oklahoma!" → trailing !
      // These are Wikipedia's naming conventions, not a genre enumeration.
      const isEntertainmentByTitle = /\(\d{4}\s*(?:film|movie|TV series|television series|song|album|novel|book|miniseries|documentary)\)|!+$|\bSeason \d+\b/i
        .test(a.title)
      if (isEntertainmentByTitle) return
    }

    seen.add(a.title)
    candidates.push(a)
  }

  // ── DDG: noun phrase variants ──
  const ddgResults = await Promise.all(ddgQueries.map(ddgForPhrase))
  for (const r of ddgResults) add(r)

  // ── Wikipedia: full-text search with LONG queries + OpenSearch for suggestions ──
  // OpenSearch on BOTH long queries AND short noun phrases.
  // OpenSearch "rainbows" → "Rainbow"; "singing sand" → "Singing sand"
  // Short noun phrases are from ddgQueries; long queries often miss.
  const openSearchInputs = [...new Set([...wikiQueries.slice(0, 3), ...ddgQueries.slice(0, 4)])]
  const [wikiSearchResults, openSearchResults, serperResults] = await Promise.all([
    Promise.all(wikiQueries.map(q => wikiSearch(q, 8))),
    Promise.all(openSearchInputs.map(q => wikiOpenSearch(q))),
    serperSearch(query),  // Google-resolved titles + answer snippets
  ])

  const allSearchHits = wikiSearchResults.flat()
  const openSearchTitles = [...new Set(openSearchResults.flat())]

  await Promise.all([
    ...allSearchHits
      .filter((h, i, arr) => arr.findIndex(x => x.title === h.title) === i && !seen.has(h.title))
      .slice(0, 14)
      .map(async h => add(await wikiSummary(h.title))),

    ...openSearchTitles
      .filter(t => !seen.has(t))
      .slice(0, 8)
      .map(async t => add(await wikiSummary(t))),

    // Serper: Google-resolved Wikipedia articles, fetched in parallel with everything else
    ...serperResults
      .filter(r => !seen.has(r.title))
      .map(async r => add(await wikiSummary(r.title))),
  ])

  // Add Serper snippets directly to the passage pool.
  // Google selects these snippets to answer the specific query — they often contain
  // the exact mechanism text that BM25 passage scoring misses (e.g., Singing sand
  // snippet: "caused by walking on the sand" for "why does sand squeak when walking").
  // ── Serper-first strategy ──
  // Trust Google's rank-0 result directly: fetch its full article and score passages.
  // If the passage scores >= 0.15, return it immediately without running multi-candidate.
  // This avoids the boost-based approach that caused regressions.
  const ENTERTAINMENT_TITLE_RE = /\(\d{4}\s*(?:film|movie|TV series|television series|song|album|novel|book|miniseries|documentary)\)|!+$|\bSeason \d+\b/i
  const ENTERTAINMENT_SNIPPET_RE = /\bis (?:a|an) \d{4}\b|\bis (?:a|an) (?:American|British|Australian|Canadian|French|German|Japanese|Korean) (?:film|television|movie|novel|song|album|book)\b/i

  // ── Serper top-3 parallel ──
  // Try Google's top-3 results in parallel and return the highest-scoring passage.
  // This beats the "Icemaker beats Thermal shock" failure: Thermal shock (rank 2) 
  // scores 0.8 while Icemaker (rank 0) scores 1.0 via word coincidence. Running all 3
  // in parallel reveals that Thermal shock is the right article to serve.
  if (serperResults.length > 0) {
    // Score top-4 Serper results. Rank 0 gets full text (1 fetch for quality);
    // ranks 1-3 get snippet + extract only (fast). This finds Thermal shock (rank 2)
    // via snippet when Icemaker (rank 0) wins on full text.
    const candidateResults = await Promise.all(
      serperResults.slice(0, 4).map(async (r, idx) => {
        const isEntertainment = !queryIsAboutLanguage && (
          ENTERTAINMENT_TITLE_RE.test(r.title) ||
          (r.snippet && ENTERTAINMENT_SNIPPET_RE.test(r.snippet))
        )
        if (isEntertainment) return null
        const art = await wikiSummary(r.title)
        if (!art?.extract) return null
        // All ranks get full text — answers are often in paragraphs 12-24, not just 0-11.
        // Rank 0 gets 25 paragraphs (0-24); ranks 1-3 get 12 paragraphs (0-11).
        // Running all 4 fetches in parallel keeps wall-clock time the same as fetching 1.
        let passages: string[] = []
        const fullText = await wikiFullText(r.title)
        const limit = idx === 0 ? 25 : 12
        passages = fullText ? splitPassages(fullText).slice(0, limit) : splitPassages(art.extract).slice(0, limit)
        if (r.snippet && r.snippet.length > 30) passages.unshift(r.snippet)
        const scored = await rankPassages(query, passages)
        const best = scored[0]
        if (!best || best.score < 0.2) return null
        const snippetEntry = r.snippet ? scored.find(s => s.passage === r.snippet) : null
        // Only prefer snippet when it matches or beats the best passage score.
        // Avoids returning a generic "Joint cracking is..." snippet (0.33) when
        // a full-text passage "dissolve back into... cracking sound" scores 0.67.
        const chosen = snippetEntry && snippetEntry.score >= best.score ? snippetEntry : best
        return { passage: chosen.passage, score: chosen.score, article: art }
      })
    )
    const validResults = candidateResults.filter((r): r is NonNullable<typeof r> => r !== null)
    // Use find() not sort() so Serper's rank order breaks ties.
    const maxScore = validResults.reduce((m, r) => Math.max(m, r.score), 0)
    const best = validResults.find(r => r.score === maxScore)
    if (best) {
      return {
        passage: best.passage.slice(0, 800),
        articleTitle: best.article.title,
        articleUrl: best.article.url,
        score: best.score,
      }
    }
  }

  // ── Fallback: multi-candidate passage scoring ──
  // Serper rank-0 didn't answer confidently — try all candidates.
  // No boosts: pure BM25 recall scoring over all passages.
  const serperSnippetPassages: Array<{ passage: string; articleTitle: string; articleUrl: string }> = []
  for (const r of serperResults.slice(1)) {  // rank 1+ (rank 0 already tried above)
    if (!queryIsAboutLanguage) {
      if (ENTERTAINMENT_TITLE_RE.test(r.title)) continue
      if (r.snippet && ENTERTAINMENT_SNIPPET_RE.test(r.snippet)) continue
    }
    if (r.snippet && r.snippet.length > 30) {
      serperSnippetPassages.push({ passage: r.snippet, articleTitle: r.title, articleUrl: r.url })
    }
  }

  if (!candidates.length) return null

  // Ensure Serper articles appear first in the candidates slice.
  // Without this, Serper rank-2 ("Thermal shock" for "ice crack") would be pushed
  // beyond position 8 by 14 Wikipedia hits and never have its full text scored.
  const serperTitles = new Set(serperResults.slice(1).map(r => r.title))
  const serperCandidates = candidates.filter(c => serperTitles.has(c.title))
  const otherCandidates = candidates.filter(c => !serperTitles.has(c.title))
  const orderedCandidates = [...serperCandidates, ...otherCandidates]

  const allPassages: Array<{ passage: string; articleTitle: string; articleUrl: string }> = [
    ...serperSnippetPassages,
  ]

  await Promise.all(
    orderedCandidates.slice(0, 10).map(async c => {
      const fullText = await wikiFullText(c.title)
      const text = fullText ?? c.extract
      for (const p of splitPassages(text).slice(0, 15)) {
        allPassages.push({ passage: p, articleTitle: c.title, articleUrl: c.url })
      }
    })
  )

  if (!allPassages.length) return null

  const ranked = await rankPassages(query, allPassages.map(p => p.passage))
  const best = ranked[0]
  if (!best || best.score < 0.15) return null

  const meta = allPassages.find(p => p.passage === best.passage)!
  return {
    passage: best.passage.slice(0, 800),
    articleTitle: meta.articleTitle,
    articleUrl: meta.articleUrl,
    score: best.score,
  }
}
