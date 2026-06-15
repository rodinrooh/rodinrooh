/**
 * Retrieval: Google (Serper) finds the article, HF ranks the passages.
 *
 * Architecture:
 *   1. Ask Google for top-5 Wikipedia articles
 *   2. Score each article's snippet with HF in one batch call
 *   3. If best snippet >= 0.5 → it IS the answer, return it directly
 *   4. Otherwise scan the best-snippet article's full text for a better passage
 *
 * Serper's rank-0 snippet is already the answer for ~80% of mechanism questions.
 */

import { wikiSummary, wikiFullText, splitPassages } from "./wiki"
import { rankPassages } from "./embed"

const SNIPPET_THRESHOLD = 0.5   // snippet directly answers the question
const PASSAGE_THRESHOLD = 0.25  // minimum confidence to return anything

type SerperResult = { title: string; snippet: string; url: string }

async function serperSearch(query: string): Promise<SerperResult[]> {
  const key = process.env.SERPER_API_KEY
  if (!key) return []
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      body: JSON.stringify({ q: `${query} site:en.wikipedia.org`, num: 5 }),
      next: { revalidate: 60 },  // 1-min cache: stable within a session, not 1hr stale
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

function queryIsAboutLanguage(q: string): boolean {
  return /\b(pronoun|grammar|preposition|conjunction|syntax|linguistics|language|parts of speech)\b/i.test(q)
}

export type RetrievalResult = {
  passage: string
  articleTitle: string
  articleUrl: string
  score: number
}

export async function retrieveBestPassage(query: string): Promise<RetrievalResult | null> {
  const serperResults = await serperSearch(query)
  if (!serperResults.length) return null

  // Only score top-3 Serper results. Ranks 3-4 contain tangential articles
  // ("When the Birds Fly South", "Food drunk") that score high on BM25 by
  // containing exact query words in unrelated contexts.
  const candidateResults = serperResults.slice(0, 3)

  // Fetch summaries for all 3 candidates to apply content filters
  const summaries = await Promise.all(candidateResults.map(r => wikiSummary(r.title)))

  // Build snippet pairs keeping the original index — critical to avoid index alignment bugs
  const snippetPairs: Array<{ snippet: string; serperIdx: number }> = []
  for (let i = 0; i < candidateResults.length; i++) {
    const snippet = candidateResults[i].snippet
    if (!snippet || snippet.length < 30) continue

    // Apply content filters using the fetched summary
    const summary = summaries[i]
    if (!queryIsAboutLanguage(query) && summary) {
      const desc = summary.description ?? ""
      const isGrammar = /\b(pronoun|preposition|determiner|conjunction|grammatical|linguistics?|English word)\b/i.test(desc)
      const isMedia = /\b(studio album|debut album|extended play|live album|single by|music video|television series|TV series|animated series|video game)\b/i.test(desc)
      if (isGrammar || isMedia) continue
    }

    snippetPairs.push({ snippet, serperIdx: i })
  }
  // Note: serperIdx now refers to index in candidateResults, not serperResults

  if (!snippetPairs.length) return null

  // Score all snippets in one HF call — cheap (3 short texts)
  const snippetTexts = snippetPairs.map(p => p.snippet)
  const snippetResult = await rankPassages(query, snippetTexts)
  const { results: snippetScores, usingHF: snippetHF } = snippetResult

  // Build score lookup by snippet text
  const scoreByText = new Map(snippetScores.map(s => [s.passage, s.score]))

  // Find the best-scoring snippet, preserving Serper rank order for ties
  let bestPair = snippetPairs[0]
  let bestScore = scoreByText.get(bestPair.snippet) ?? 0
  for (const pair of snippetPairs.slice(1)) {
    const score = scoreByText.get(pair.snippet) ?? 0
    if (score > bestScore) { bestScore = score; bestPair = pair }
  }

  const bestResult = candidateResults[bestPair.serperIdx]
  const bestSummary = summaries[bestPair.serperIdx] ?? await wikiSummary(bestResult.title)

  // If the snippet directly answers the question, return it immediately.
  // ONLY trust this threshold when HF confirmed working — BM25 keyword overlap scores
  // (e.g., Atlantic Flyway = 0.75 BM25 for "birds fly south") are not semantic confidence.
  if (snippetHF && bestScore >= SNIPPET_THRESHOLD && bestSummary) {
    return {
      passage: bestPair.snippet.slice(0, 800),
      articleTitle: bestSummary.title,
      articleUrl: bestSummary.url,
      score: bestScore,
    }
  }

  // Snippet wasn't confident enough — scan full articles.
  // Always scan Serper rank-0 (Google's top result) PLUS the best-snippet article if different.
  // "birds fly south" → Bird migration is rank-0 (correct) but Atlantic Flyway (rank-2) had
  // higher BM25 snippet score. Always including rank-0 ensures Bird migration gets scanned.
  const rank0Result = candidateResults[0]
  const rank0Summary = summaries[0] ?? await wikiSummary(rank0Result.title)
  if (!rank0Summary?.extract) return null

  // Also scan the best-snippet article if it's different from rank-0
  const alsoScanBest = bestResult.title !== rank0Result.title
  const [rank0Full, bestFull, bestSummaryFetched] = await Promise.all([
    wikiFullText(rank0Result.title),
    alsoScanBest ? wikiFullText(bestResult.title) : Promise.resolve(null),
    alsoScanBest ? (bestSummary ?? wikiSummary(bestResult.title)) : Promise.resolve(null),
  ])

  type PassageMeta = { passage: string; title: string; url: string }
  const allPassages: PassageMeta[] = []

  // Rank-0 passages (25) — always first
  const p0 = splitPassages(rank0Full ?? rank0Summary.extract).slice(0, 25)
  const rank0Snippet = candidateResults[0].snippet
  if (rank0Snippet && rank0Snippet.length > 30) p0.unshift(rank0Snippet)
  p0.forEach(p => allPassages.push({ passage: p, title: rank0Summary.title, url: rank0Summary.url }))

  // Best-snippet article passages (15) if different from rank-0
  if (alsoScanBest && bestFull && bestSummaryFetched?.extract) {
    splitPassages(bestFull).slice(0, 15)
      .forEach(p => allPassages.push({ passage: p, title: bestSummaryFetched.title, url: bestSummaryFetched.url }))
  }

  const { results: passageScores } = await rankPassages(query, allPassages.map(m => m.passage))
  const best = passageScores[0]
  if (!best || best.score < PASSAGE_THRESHOLD) return null

  const meta = allPassages.find(m => m.passage === best.passage)!
  return {
    passage: best.passage.slice(0, 800),
    articleTitle: meta.title,
    articleUrl: meta.url,
    score: best.score,
  }
}
