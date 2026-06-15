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

import { wikiSummary, wikiFullText, splitPassages } from "./wiki"
import { rankPassages } from "./embed"

const SNIPPET_THRESHOLD = 0.5
const PASSAGE_THRESHOLD = 0.25
const BM25_PREFILTER_N = 5

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
    const pLow = " " + p.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ") + " "
    let hits = 0
    for (const w of qWords) {
      const stem = w.endsWith("e") ? w.slice(0, -1) : w
      const forms = [w, w + "s", stem + "ing", stem + "ed", stem + "er",
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
      if (/\b(studio album|debut album|extended play|live album|single by|music video|television series|TV series|animated series|video game)\b/i.test(desc)) continue
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

  // Only return snippet when: HF confirmed + rank-0 is the best candidate + score >= threshold
  if (snippetHF && rank0Pair && rank0SnippetScore >= SNIPPET_THRESHOLD && summaries[0]) {
    return { passage: rank0Pair.snippet.slice(0, 800), articleTitle: summaries[0].title, articleUrl: summaries[0].url, score: rank0SnippetScore }
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
  const [full0, fullBest, sumBest] = await Promise.all([
    wikiFullText(rank0.title),
    bestIsRank0 ? Promise.resolve(null) : wikiFullText(bestResult.title),
    bestIsRank0 ? Promise.resolve(null) : (bestSummary ?? wikiSummary(bestResult.title)),
  ])

  // BM25 pre-select top-5 from each article → HF sees ~10-15 passages total, not 40
  type PM = { p: string; title: string; url: string }
  const pool: PM[] = []

  // Rank-0: always include Wikipedia extract first (explains the concept)
  // and BM25-top-5 from full text for specific details.
  if (sum0.extract) pool.push({ p: sum0.extract, title: sum0.title, url: sum0.url })
  const r0snip = rank0.snippet
  if (r0snip && r0snip.length > 30) pool.push({ p: r0snip, title: sum0.title, url: sum0.url })
  bm25Prefilter(query, splitPassages(full0 ?? sum0.extract), BM25_PREFILTER_N)
    .forEach(p => pool.push({ p, title: sum0.title, url: sum0.url }))

  // Best-snippet article (if different from rank-0): include extract + BM25-top-3
  // This handles "Thermal shock" rank-2 for ice cubes when rank-0 is Icemaker.
  if (!bestIsRank0 && fullBest && sumBest?.extract) {
    pool.push({ p: sumBest.extract, title: sumBest.title, url: sumBest.url })
    bm25Prefilter(query, splitPassages(fullBest), 3)
      .forEach(p => pool.push({ p, title: sumBest.title, url: sumBest.url }))
  }

  if (!pool.length) return null

  // HF final scorer on the pre-filtered pool — small batch, reliably completes
  const { results: scored } = await rankPassages(query, pool.map(x => x.p))
  const best = scored[0]
  if (!best || best.score < PASSAGE_THRESHOLD) return null

  const meta = pool.find(x => x.p === best.passage)!
  return { passage: best.passage.slice(0, 800), articleTitle: meta.title, articleUrl: meta.url, score: best.score }
}
