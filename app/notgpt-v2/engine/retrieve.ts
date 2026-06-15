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

const SNIPPET_THRESHOLD = 0.7
const PASSAGE_THRESHOLD = 0.25
const BM25_PREFILTER_N = 8

type SerperResult = { title: string; snippet: string; url: string }

async function serperSearch(query: string): Promise<SerperResult[]> {
  const key = process.env.SERPER_API_KEY
  if (!key) return []
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: `${query} site:en.wikipedia.org`, num: 5 }),
      next: { revalidate: 60 },
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

export async function retrieveBestPassage(query: string): Promise<RetrievalResult | null> {
  const serperResults = await serperSearch(query)
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
  if (snippetHF && rank0Pair && rank0SnippetScore >= SNIPPET_THRESHOLD) {
    const snip = rank0Pair.snippet
    const isImageCaption = /^(?:A|An|The)(?:\s+\w+){2,3}\s+\w+ing\b/.test(snip) && snip.length < 300
    const passage = isImageCaption ? (summaries[0]?.extract ?? snip) : snip
    if (passage && summaries[0]) {
      return { passage: passage.slice(0, 800), articleTitle: summaries[0].title, articleUrl: summaries[0].url, score: rank0SnippetScore }
    }
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

  // Also try Wikipedia's own search as a 4th source. Serper finds the most popular article,
  // but Wikipedia search sometimes surfaces more specific mechanism articles (e.g., "Lift (force)"
  // for "how do airplanes stay in the air" when Serper only returns the general "Airplane" article).
  const wikiResults = await wikiSearch(query, 3)
  const serperTitles = new Set(candidateResults.map(r => r.title.toLowerCase()))
  const wikiExtra = wikiResults.find(r => !serperTitles.has(r.title.toLowerCase()) &&
    !r.title.startsWith("Wikipedia:") && !r.title.includes("(disambiguation)") &&
    !r.title.startsWith("List of"))

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
  // Helper: true if an article's Wikipedia description marks it as entertainment
  const isEntertainment = (desc: string) =>
    /\b(studio album|debut album|extended play|live album|single by|music video|television series|TV series|animated series|video game|rock band|pop band|music group|musical group|punk band|metal band|jazz ensemble)\b/i.test(desc)

  addArticle(full0, sum0, rank0.snippet, 4, BM25_PREFILTER_N)
  const sum1 = summaries[1] ?? (rank1 ? await wikiSummary(rank1.title) : null)
  if (sum1?.extract && !isEntertainment(sum1.description ?? "")) addArticle(full1, sum1, "", 2, 3)
  const sum2 = summaries[2] ?? (rank2 ? await wikiSummary(rank2.title) : null)
  if (sum2?.extract && !isEntertainment(sum2.description ?? "")) addArticle(full2, sum2, "", 2, 3)
  // 4th source: Wikipedia's own search top result (skips duplicates already in pool)
  if (wikiExtra && fullWiki) {
    const sumWiki = await wikiSummary(wikiExtra.title)
    if (sumWiki?.extract && !isEntertainment(sumWiki.description ?? ""))
      addArticle(fullWiki, sumWiki, "", 2, 3)
  }

  if (!pool.length) return null

  // HF final scorer on the pre-filtered pool — small batch, reliably completes
  const { results: scored } = await rankPassages(query, pool.map(x => x.p))
  const best = scored[0]
  if (!best || best.score < PASSAGE_THRESHOLD) return null

  const meta = pool.find(x => x.p === best.passage)!
  return { passage: best.passage.slice(0, 800), articleTitle: meta.title, articleUrl: meta.url, score: best.score }
}
