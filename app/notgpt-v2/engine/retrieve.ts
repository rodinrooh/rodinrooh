/**
 * Retrieval: Google (Serper) finds the article, HF ranks the passages.
 *
 * Architecture:
 *   1. Ask Google for top-3 Wikipedia articles
 *   2. Score snippets with HF (small batch = fast, reliable)
 *   3. If best snippet >= 0.5 and HF confirmed working: return snippet directly
 *   4. Fallback: BM25 pre-selects top-5 per article (~10-15 total), HF scores those
 *
 * The key fix: BM25 as pre-filter only, HF as final scorer.
 * Old: HF scored 40 passages → cold-start timeout → BM25 fallback → "Atlantic Flyway"
 *      wins because it literally contains "south + birds + winter" by coincidence.
 * New: BM25 narrows 25 passages to 5, HF scores 10-15 total → completes in 3-5s,
 *      no timeout, semantic scoring picks Bird migration correctly over Atlantic Flyway.
 */

import { wikiSummary, wikiFullText, splitPassages, wikiSearch } from "./wiki"
import { rankPassages } from "./embed"
import { normalizeQuery, QueryContext } from "./normalize"
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nlp = require("compromise")

const SNIPPET_THRESHOLD = 0.7
const PASSAGE_THRESHOLD = 0.37
const BM25_PREFILTER_N = 8

type SerperResult = { title: string; snippet: string; url: string }

// In-memory Serper cache keyed by query string — 60s TTL.
// This replaces Next.js's broken POST cache (which keys on URL only, ignoring body,
// causing all Serper calls to return the same cached result).
const _serperCache = new Map<string, { result: SerperResult[]; expires: number }>()

async function serperSearch(query: string): Promise<SerperResult[]> {
  const key = process.env.SERPER_API_KEY
  if (!key) return []
  try {
    // IMPORTANT: Next.js caches POST requests by URL only (ignores body), causing all
    // Serper queries to return the same cached result. Use cache:'no-store' and implement
    // our own per-query in-memory cache keyed by the actual query string.
    const cached = _serperCache.get(query)
    if (cached && cached.expires > Date.now()) return cached.result
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: `${query} site:en.wikipedia.org`, num: 5 }),
      cache: "no-store",  // disable Next.js body-ignoring cache
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
      if (/\(\d{4}\s*(?:film|movie|TV series|song|album|novel)\)|!+$|\bSeason \d+\b/i.test(title)) continue
      results.push({ title, snippet: r.snippet ?? "", url: r.link })
    }
    _serperCache.set(query, { result: results, expires: Date.now() + 60_000 })
    return results
  } catch { return [] }
}

/**
 * Fast BM25 keyword pre-filter. Picks top-N passages most likely to answer the query.
 * No API, no model — pure JS word matching. Used only to narrow candidates before HF.
 */
function bm25Prefilter(query: string, passages: string[], topN: number): string[] {
  const STOPS = new Set(["the","a","an","is","are","was","were","do","does","did",
    "why","how","what","who","when","where","which","my","your","i","we","they",
    "he","she","it","and","or","but","in","of","to","for","with","on","at","from",
    "by","this","that","these","those","can","will","would","could","should","have",
    "has","had","not","so","if","as","than","then","be","been","being","just","very"])
  const qWords = [...new Set(
    query.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
      .filter(w => w.length > 2 && !STOPS.has(w))
  )]
  if (!qWords.length) return passages.slice(0, topN)

  const scored = passages.map(p => {
    // Refutation passages explain what something ISN'T, not how it works.
    // A passage saying "X has no scientific evidence" or "is a myth" actively misleads
    // HF into scoring it high because it repeats the topic vocabulary many times.
    // Score these near-zero so they don't contaminate the BM25 top-N.
    const pLow = " " + p.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ") + " "
    // Refutation passages explain what something ISN'T (not the mechanism):
    const isRefutation = /without\s+scientific\s+evidence|no\s+(?:scientific\s+)?evidence|old\s+wives|debunks?\s+the|myth\s+that|is\s+not\s+supported\s+by/.test(p.toLowerCase())
    // Pure statistics passages describe WHEN/HOW OFTEN, not WHY:
    // "of those between 45 and 65, 74% have grey hair" → describes frequency, not cause
    const isPureStats = /\d+%\s+(?:of|have|had)\b.*?\baccording\s+to|according\s+to\s+(?:a|the)\s+study\s+by|\bof\s+those\s+between\s+\d+\s+and\s+\d+/.test(p)
    if (isRefutation || isPureStats) return { passage: p, score: 0 }

    let hits = 0
    for (const w of qWords) {
      const stem = w.endsWith("e") ? w.slice(0, -1) : w
      const forms = [w, w + "s", w + "ish", w + "ness", w + "ly",
        stem + "ing", stem + "ed", stem + "er",
        w.endsWith("s") && w.length > 4 ? w.slice(0, -1) : w]
      if ([...new Set(forms)].some(f => f.length > 1 && pLow.includes(` ${f} `))) hits++
    }
    return { passage: p, score: hits / qWords.length }
  })
  return scored.sort((a, b) => b.score - a.score).slice(0, topN).map(s => s.passage)
}

function queryIsAboutLanguage(q: string): boolean {
  return /\b(pronoun|grammar|preposition|conjunction|syntax|linguistics|language|parts of speech)\b/i.test(q)
}

export type RetrievalResult = { passage: string; articleTitle: string; articleUrl: string; score: number }

/** Cut text at the last complete sentence within maxChars, never mid-word or mid-sentence. */
function truncateAtSentence(text: string, maxChars = 1000): string {
  // Strip trailing "..." — Serper and Wikipedia REST API use this for mid-sentence truncation
  const cleaned = text.replace(/\s*\.{3}\s*$/, "").trim()

  // Core insight: Serper snippets often end mid-sentence after "..." is stripped.
  // We must detect incomplete sentences BEFORE checking length — a 200-char passage that
  // ends with "Because REM sleep is" is worse than a 130-char complete sentence.
  const endsClean = /[.!?:]\s*$/.test(cleaned)
  const textToProcess = endsClean ? cleaned : (() => {
    // Find the last complete sentence in the text
    const lastPeriod = Math.max(cleaned.lastIndexOf(". "), cleaned.lastIndexOf(".\n"))
    const lastQ = cleaned.lastIndexOf("? ")
    const lastBang = cleaned.lastIndexOf("! ")
    const lastEnd = Math.max(lastPeriod, lastQ, lastBang)
    // If we found a sentence boundary that isn't too early, use it
    if (lastEnd > cleaned.length * 0.2) return cleaned.slice(0, lastEnd + 1).trim()
    // No good boundary found — return as-is (better than nothing)
    return cleaned
  })()

  if (textToProcess.length <= maxChars) return textToProcess
  const candidate = textToProcess.slice(0, maxChars)
  const lastEnd = Math.max(
    candidate.lastIndexOf(". "),
    candidate.lastIndexOf("? "),
    candidate.lastIndexOf("! "),
    candidate.lastIndexOf(".\n"),
  )
  if (lastEnd > maxChars * 0.35) return candidate.slice(0, lastEnd + 1).trim()
  const lastSpace = candidate.lastIndexOf(" ")
  return (lastSpace > maxChars * 0.5 ? candidate.slice(0, lastSpace) : candidate).trim()
}

export async function retrieveBestPassage(query: string, context?: QueryContext): Promise<RetrievalResult | null> {
  // Normalize the query: strip filler, resolve pronouns, extract question nucleus
  const normalizedQuery = normalizeQuery(query, context)
  const serperResults = await serperSearch(normalizedQuery)
  if (!serperResults.length) return null

  const candidateResults = serperResults.slice(0, 3)
  const summaries = await Promise.all(candidateResults.map(r => wikiSummary(r.title)))

  const snippetPairs: Array<{ snippet: string; serperIdx: number }> = []
  for (let i = 0; i < candidateResults.length; i++) {
    const snippet = candidateResults[i].snippet
    if (!snippet || snippet.length < 30) continue
    const summary = summaries[i]
    if (!queryIsAboutLanguage(query) && summary) {
      const desc = summary.description ?? ""
      if (/\b(pronoun|preposition|determiner|conjunction|grammatical|linguistics?|English word)\b/i.test(desc)) continue
      if (/\b(studio album|debut album|extended play|live album|single by|music video|television series|TV series|animated series|video game|rock band|pop band|music group|musical group|punk band|metal band|jazz ensemble)\b/i.test(desc)) continue
      if (/^colou?r$/i.test(desc.trim()) || /^shade of\b/i.test(desc.trim())) continue
    }
    snippetPairs.push({ snippet, serperIdx: i })
  }
  if (!snippetPairs.length) return null

  // Score snippets with HF — small batch (3 texts), fast even on cold model
  const snippetTexts = snippetPairs.map(p => p.snippet)
  const { results: snippetScores, usingHF: snippetHF } = await rankPassages(query, snippetTexts)
  const scoreByText = new Map(snippetScores.map(s => [s.passage, s.score]))

  // Only return a snippet directly for rank-0 — Google's top pick.
  // Rank-1/2 snippets are useful to pick the best fallback article but shouldn't
  // be returned before reading the actual article (they're teaser sentences, not answers).
  const rank0Pair = snippetPairs.find(p => p.serperIdx === 0)
  const rank0SnippetScore = rank0Pair ? (scoreByText.get(rank0Pair.snippet) ?? 0) : 0

  // Pick best candidate for fallback scan (could be rank-1 if it scores higher than rank-0)
  let bestPair = snippetPairs[0]
  let bestScore = scoreByText.get(bestPair.snippet) ?? 0
  for (const pair of snippetPairs.slice(1)) {
    const score = scoreByText.get(pair.snippet) ?? 0
    if (score > bestScore) { bestScore = score; bestPair = pair }
  }

  const bestResult = candidateResults[bestPair.serperIdx]
  const bestSummary = summaries[bestPair.serperIdx] ?? await wikiSummary(bestResult.title)

  // Return snippet when rank-0 scores high and HF is confirmed.
  // Detect image captions: "A young girl hastily consuming ice cream..." pattern
  // (animate subject + participial phrase). For those, return the Wikipedia extract instead
  // since image captions describe photos, not the topic mechanism.
  if (snippetHF && rank0Pair && rank0SnippetScore >= SNIPPET_THRESHOLD && summaries[0]) {
    // Return the Wikipedia extract (complete sentences) not the Serper snippet.
    // Serper snippets are truncated mid-sentence by Google (e.g. "bounded by Florida, Bermuda, and ...")
    // The Wikipedia REST API extract is always the article's intro in full sentences.
    const passage = summaries[0].extract || rank0Pair.snippet
    return { passage: truncateAtSentence(passage), articleTitle: summaries[0].title, articleUrl: summaries[0].url, score: rank0SnippetScore }
  }

  // ── BM25 pre-filter → HF final scoring ──
  // Always scan rank-0. Also scan the best-snippet article when it's different from rank-0.
  // This handles both failure modes:
  //   - "birds fly south": rank-0 (Bird migration) is right but rank-2 (Atlantic Flyway)
  //     had a misleadingly high snippet score. Scan rank-0 only → Bird migration wins.
  //   - "ice cubes crack": rank-0 (Icemaker) is wrong, rank-2 (Thermal shock) is right.
  //     Scan rank-0 + best-snippet (Thermal shock) → Thermal shock wins.
  const rank0 = candidateResults[0]
  const sum0 = summaries[0] ?? await wikiSummary(rank0.title)
  if (!sum0?.extract) return null

  const bestIsRank0 = bestPair.serperIdx === 0
  const rank1 = candidateResults[1], rank2 = candidateResults[2]

  // Also try Wikipedia's own search as additional sources. Serper finds the most popular article,
  // but Wikipedia search sometimes surfaces more specific mechanism articles.
  // We use all non-duplicate wikiSearch results — this catches "List of common misconceptions"
  // for debunking queries (was previously blocked by overly broad "List of" filter).
  const wikiResults = await wikiSearch(normalizedQuery, 3)
  const serperTitles = new Set(candidateResults.map(r => r.title.toLowerCase()))
  const wikiExtras = wikiResults.filter(r =>
    !serperTitles.has(r.title.toLowerCase()) &&
    !r.title.startsWith("Wikipedia:") && !r.title.includes("(disambiguation)") &&
    !r.title.includes("Talk:") && !r.title.includes("Archive")
  )
  const wikiExtra = wikiExtras[0]  // for fullWiki fetch (backward compat)

  const [full0, full1, full2, fullWiki] = await Promise.all([
    wikiFullText(rank0.title),
    wikiFullText(rank1?.title ?? ""),
    wikiFullText(rank2?.title ?? ""),
    wikiExtra ? wikiFullText(wikiExtra.title) : Promise.resolve(null),
  ])

  // Build pool from each article: extract + first-4 intro passages + BM25-top-N
  // "First-4 intro" ensures cause/mechanism text (early paragraphs) is always present.
  // BM25 adds keyword-matched passages for specific detail. HF picks the best among ~15-20.
  type PM = { p: string; title: string; url: string }
  const pool: PM[] = []
  const seen = new Set<string>()
  const addP = (p: string, title: string, url: string) => {
    const key = p.trim().slice(0, 80)
    if (!seen.has(key)) { seen.add(key); pool.push({ p, title, url }) }
  }

  // Passages that describe myths/correlations/culture rather than mechanisms.
  // Detecting text STRUCTURE (refutation, statistics, cultural belief), not topic vocabulary.
  const isJunkPassage = (p: string) =>
    /without\s+scientific\s+evidence|no\s+(?:scientific\s+)?evidence|old\s+wives|debunks?\s+the|myth\s+that|is\s+not\s+supported\s+by/.test(p.toLowerCase()) ||
    /\bof\s+those\s+between\s+\d+\s+and\s+\d+|according\s+to\s+(?:a|the)\s+(?:\d{4}\s+)?study\s+by\s+\w|\d+%\s+(?:of|have|had)\b/.test(p) ||
    /\bcultures?\s+believe\b|\bfolklore\s+(?:states?|says?)\b|\btraditionally\s+associated\s+with\s+(?:good|bad|luck)\b|\bbelieved\s+to\s+bring\s+(?:good|bad)\b/.test(p.toLowerCase())

  const addArticle = (text: string | null, sum: { extract: string; title: string; url: string }, snippet: string, introN: number, bm25N: number) => {
    // Add extract unless it's a cultural-belief or myth passage (not a mechanism explanation)
    if (sum.extract && !isJunkPassage(sum.extract)) addP(sum.extract, sum.title, sum.url)
    if (snippet && snippet.length > 30) addP(snippet, sum.title, sum.url)
    const passages = splitPassages(text ?? sum.extract)
    passages.slice(0, introN).forEach(p => addP(p, sum.title, sum.url))
    bm25Prefilter(query, passages, bm25N).forEach(p => addP(p, sum.title, sum.url))
  }

  // Always scan all 3 Serper articles. Each adds: extract + BM25 passages.
  // Rank-0 also gets its Serper snippet and more intro passages.
  // Wikipedia extracts are reliable article intros; secondary article Serper snippets
  // can be deceptive (Atlantic Flyway "warm climates... birds in winter" = 0.73 vs
  // Bird migration extract = 0.65 → Bird migration WINS from extract, not snippet).
  // Helper: true if an article should be excluded (entertainment entity or pure color swatch)
  const isEntertainment = (desc: string) =>
    /\b(studio album|debut album|extended play|live album|single by|music video|television series|TV series|animated series|video game|rock band|pop band|music group|musical group|punk band|metal band|jazz ensemble)\b/i.test(desc) ||
    /^colou?r$/i.test(desc.trim()) ||            // desc is just "Color"
    /^shade of\b/i.test(desc.trim()) ||          // desc is "Shade of blue" etc.
    /^colou?r\s+(?:in|by|from)\b/i.test(desc)   // "Color in art" type articles

  // Apply entertainment filter to rank-0 too. When Serper rank-0 is a junk article
  // (e.g. "Slippery When Wet" album for "wet hair" query), don't add its passages —
  // they'd dilute the pool and the next-best wrong article would win.
  if (!isEntertainment(sum0.description ?? "")) {
    addArticle(full0, sum0, rank0.snippet, 4, BM25_PREFILTER_N)
  }
  const sum1 = summaries[1] ?? (rank1 ? await wikiSummary(rank1.title) : null)
  if (sum1?.extract && !isEntertainment(sum1.description ?? "")) addArticle(full1, sum1, "", 2, 3)
  const sum2 = summaries[2] ?? (rank2 ? await wikiSummary(rank2.title) : null)
  if (sum2?.extract && !isEntertainment(sum2.description ?? "")) addArticle(full2, sum2, "", 2, 3)
  // 4th source: Wikipedia's own search — fire when rank-0 is uncertain OR when a named
  // entity in the query is absent from the rank-0 article title.
  // Example: "who is the ceo of apple" → rank-0 = "Chief executive officer" (generic).
  // "Apple" is a named entity in the query but not in rank-0 title → wikiSearch fires → Tim Cook.
  // Skip wikiSearch when context entity is already in pool (avoids Money for "how much Supreme").
  const contextEntityInPool = context?.article ?
    pool.some(p => p.title.toLowerCase().includes(
      context.article!.replace(/\s*\([^)]+\)\s*$/, "").trim().toLowerCase()
    )) : false

  // Check if named entity in query is absent from rank-0 (signals wrong article from Serper).
  // Also checks if rank-0 describes a GENERIC ROLE/CONCEPT when the query asks about a specific
  // entity (e.g. "who is the ceo of apple" → rank-0 "Chief executive officer" is a concept,
  // but the query is about a specific person at Apple → wikiSearch finds Tim Cook).
  const queryHasEntityMissingFromRank0 = (() => {
    try {
      // Named entity check (works for properly capitalized entities)
      const qDoc = (nlp as any)(normalizedQuery)
      const entities: string[] = qDoc.match("#ProperNoun").out("array")
      if (entities.length > 0) {
        const rank0Lower = (sum0.title + " " + (sum0.extract || "")).toLowerCase()
        if (entities.some((e: string) => e.length > 2 && !rank0Lower.includes(e.toLowerCase()))) return true
      }
      // Role/concept article check: "who is the [role] of [entity]" queries.
      // If rank-0 describes a generic role/position rather than a specific person/thing,
      // wikiSearch should find the specific answer.
      const isGenericRole = /\b(officer|role|position|job|title|highest-ranking|executive)\b/i.test(sum0.description || "")
      const queryAsksPerson = /\b(who\s+is|who\s+was|who\s+are|who\s+runs|who\s+founded|who\s+leads?)\b/i.test(normalizedQuery)
      if (isGenericRole && queryAsksPerson) return true
      return false
    } catch { return false }
  })()

  if ((rank0SnippetScore < 0.65 || queryHasEntityMissingFromRank0) && !contextEntityInPool && wikiExtras.length > 0) {
    // Fetch full text for all wikiExtras (first one already fetched as fullWiki)
    const fullTexts = [fullWiki, ...await Promise.all(
      wikiExtras.slice(1).map(r => wikiFullText(r.title))
    )]
    for (let i = 0; i < wikiExtras.length; i++) {
      const sumW = await wikiSummary(wikiExtras[i].title)
      if (sumW?.extract && !isEntertainment(sumW.description ?? ""))
        addArticle(fullTexts[i] ?? null, sumW, "", 2, 2)
    }
  }

  // If coreference context was used, pin the context article in the pool.
  // Without this, wikiSearch can inject generic articles (e.g. "Money" for
  // "how much money has Supreme made") that beat the real context article.
  if (context?.article) {
    const ctxTitle = context.article.replace(/\s*\([^)]+\)\s*$/, "").trim()
    const alreadyInPool = pool.some(p => p.title.toLowerCase().includes(ctxTitle.toLowerCase()))
    if (!alreadyInPool) {
      const ctxSum = await wikiSummary(ctxTitle)
      if (ctxSum?.extract && !isEntertainment(ctxSum.description ?? "")) {
        const ctxFull = await wikiFullText(ctxTitle)
        addArticle(ctxFull, ctxSum, "", 3, 4)
      }
    }
  }

  if (!pool.length) return null

  // HF final scorer on the pre-filtered pool — small batch, reliably completes
  const { results: scored } = await rankPassages(query, pool.map(x => x.p))
  if (!scored.length) return null

  // Coreference override — only fires when the normalized query explicitly mentions
  // the context entity name (meaning normalizeQuery resolved a pronoun and injected it).
  //
  // This gate is critical: "how does it work" after WiFi → normalized to "how does WiFi work"
  // → query contains "wifi" → override fires → return WiFi passage even if score is low.
  //
  // WITHOUT the gate (old bug): "what about black holes" after Stock market crash → query
  // doesn't contain "stock market" → override skipped → Black hole passage returned ✓.
  // WITH the old code: override fired for ALL context queries → returned Stock market
  // crash passage even when user explicitly switched topics to black holes.
  let best = scored[0]
  let meta = pool.find(x => x.p === best.passage)!
  if (context?.article) {
    const ctxLower = context.article.replace(/\s*\([^)]+\)\s*$/, "").trim().toLowerCase()
    // Only override when the query actually mentions the context entity — i.e., pronoun
    // resolution injected the entity name into the query. New-topic queries ("what about
    // black holes") will never mention "stock market" → they fall through to normal retrieval.
    if (query.toLowerCase().includes(ctxLower)) {
      const resultIsCtxEntity = meta.title.toLowerCase().includes(ctxLower)
      if (!resultIsCtxEntity) {
        // Best HF result is not the context entity. Override with context entity's passage
        // since user made an explicit pronoun-referential follow-up about it.
        for (const s of scored) {
          const m = pool.find(x => x.p === s.passage)
          if (m?.title.toLowerCase().includes(ctxLower)) {
            best = s
            meta = m
            break
          }
        }
        if (!meta.title.toLowerCase().includes(ctxLower)) return null
      }
      // Skip threshold for pronoun follow-ups — user explicitly asked about this entity
      return { passage: truncateAtSentence(best.passage), articleTitle: meta.title, articleUrl: meta.url, score: best.score }
    }
    // New topic: query doesn't mention context entity → fall through to normal threshold check
  }

  if (!best || best.score < PASSAGE_THRESHOLD) return null

  return { passage: truncateAtSentence(best.passage), articleTitle: meta.title, articleUrl: meta.url, score: best.score }
}
