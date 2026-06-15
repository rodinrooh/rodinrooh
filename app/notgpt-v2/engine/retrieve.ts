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
      cache: "no-store",  // always fresh — stale Serper results cause wrong answers
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

  // Fetch article descriptions for the top-3 to apply content filters
  const summaries = await Promise.all(
    serperResults.slice(0, 3).map(r => wikiSummary(r.title))
  )

  // Build snippet pairs keeping the original serperResults index — this is critical.
  // Filtering snippets into a separate array and using .indexOf() breaks index alignment.
  const snippetPairs: Array<{ snippet: string; serperIdx: number }> = []
  for (let i = 0; i < serperResults.length; i++) {
    const snippet = serperResults[i].snippet
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

  if (!snippetPairs.length) return null

  // Score all snippets in one HF call — cheap (5 short texts)
  const snippetTexts = snippetPairs.map(p => p.snippet)
  const snippetScores = await rankPassages(query, snippetTexts)

  // Build score lookup by snippet text
  const scoreByText = new Map(snippetScores.map(s => [s.passage, s.score]))

  // Find the best-scoring snippet, preserving Serper rank order for ties
  let bestPair = snippetPairs[0]
  let bestScore = scoreByText.get(bestPair.snippet) ?? 0
  for (const pair of snippetPairs.slice(1)) {
    const score = scoreByText.get(pair.snippet) ?? 0
    if (score > bestScore) { bestScore = score; bestPair = pair }
  }

  const bestResult = serperResults[bestPair.serperIdx]
  const bestSummary = summaries[bestPair.serperIdx] ?? await wikiSummary(bestResult.title)

  // If the snippet directly answers the question, return it immediately
  if (bestScore >= SNIPPET_THRESHOLD && bestSummary) {
    return {
      passage: bestPair.snippet.slice(0, 800),
      articleTitle: bestSummary.title,
      articleUrl: bestSummary.url,
      score: bestScore,
    }
  }

  // Snippet wasn't confident enough — scan the full article for a better passage
  if (!bestSummary?.extract) return null

  const fullText = await wikiFullText(bestResult.title)
  const passages = splitPassages(fullText ?? bestSummary.extract).slice(0, 25)
  if (bestPair.snippet.length > 30) passages.unshift(bestPair.snippet)

  const passageScores = await rankPassages(query, passages)
  const best = passageScores[0]
  if (!best || best.score < PASSAGE_THRESHOLD) return null

  return {
    passage: best.passage.slice(0, 800),
    articleTitle: bestSummary.title,
    articleUrl: bestSummary.url,
    score: best.score,
  }
}
