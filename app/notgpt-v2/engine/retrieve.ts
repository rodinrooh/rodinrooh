/**
 * Retrieval: Google (Serper) finds the article, HF ranks the passages.
 *
 * Architecture (50 lines of real logic):
 *   1. Ask Google for top-5 Wikipedia articles for the query
 *   2. Score each article's snippet with HF
 *   3. If best snippet >= 0.5, it IS the answer — return it directly
 *   4. Otherwise fetch the best-snippet article's full text and scan for best passage
 *
 * The previous 400-line version combined DDG + Wikipedia BM25 + OpenSearch + Serper
 * into a multi-source pool with cascading fallbacks. This caused regressions where
 * the correct rank-0 Serper article was overridden by lower-quality sources.
 * Serper's rank-0 snippet is already the answer for ~80% of mechanism questions.
 */

import { wikiSummary, wikiFullText, splitPassages } from "./wiki"
import { rankPassages } from "./embed"

const SERPER_KEY = () => process.env.SERPER_API_KEY

type SerperResult = { title: string; snippet: string; url: string }

async function serperSearch(query: string): Promise<SerperResult[]> {
  const key = SERPER_KEY()
  if (!key) return []
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
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
      // Skip Wikipedia meta/talk pages, disambiguation, and explicit entertainment markers
      if (title.startsWith("Wikipedia:") || title.startsWith("Talk:") ||
          title.startsWith("List of") || title.includes("(disambiguation)")) continue
      if (/\(\d{4}\s*(?:film|movie|TV series|song|album|novel)\)|!+$|\bSeason \d+\b/i.test(title)) continue
      results.push({ title, snippet: r.snippet ?? "", url: r.link })
    }
    return results
  } catch { return [] }
}

export type RetrievalResult = {
  passage: string
  articleTitle: string
  articleUrl: string
  score: number
}

// If the query is about grammar/language, allow grammar articles through.
// "what is a pronoun" should return the pronoun article.
function queryIsAboutLanguage(query: string): boolean {
  return /\b(pronoun|grammar|preposition|conjunction|syntax|linguistics|language|parts of speech)\b/i.test(query)
}

function isGrammarArticle(description: string | undefined): boolean {
  return /\b(pronoun|preposition|determiner|conjunction|grammatical|linguistics?|English word)\b/i.test(description ?? "")
}

function isMediaArticle(description: string | undefined): boolean {
  return /\b(studio album|debut album|extended play|live album|single by|music video|television series|TV series|animated series|video game)\b/i.test(description ?? "")
}

export async function retrieveBestPassage(query: string): Promise<RetrievalResult | null> {
  const SNIPPET_THRESHOLD = 0.5   // above this: snippet directly answers the question
  const PASSAGE_THRESHOLD = 0.25  // below this: not confident enough to return anything

  const serperResults = await serperSearch(query)
  if (!serperResults.length) return null

  // Score snippets in one HF call — cheap, fast (~5 short texts)
  const snippets = serperResults.map(r => r.snippet).filter(s => s.length > 30)
  if (!snippets.length) return null

  const snippetScores = await rankPassages(query, snippets)
  const bestSnippet = snippetScores[0]

  // Fetch summaries for top results to apply article-level filters
  const summaries = await Promise.all(
    serperResults.slice(0, 3).map(r => wikiSummary(r.title))
  )

  // Find the best snippet that passes content filters
  let chosenResult: SerperResult | null = null
  let chosenSnippet: string | null = null
  let chosenScore = 0

  for (const { passage, score } of snippetScores) {
    const idx = snippets.indexOf(passage)
    if (idx < 0) continue
    const result = serperResults[idx]
    const summary = summaries[idx]

    // Skip grammar articles unless query is about language
    if (!queryIsAboutLanguage(query)) {
      if (summary && isGrammarArticle(summary.description)) continue
      if (summary && isMediaArticle(summary.description)) continue
    }

    chosenResult = result
    chosenSnippet = passage
    chosenScore = score
    break
  }

  if (!chosenResult || !chosenSnippet) return null

  // If the snippet directly answers the question, return it immediately
  if (chosenScore >= SNIPPET_THRESHOLD) {
    const art = summaries[serperResults.indexOf(chosenResult)] ?? await wikiSummary(chosenResult.title)
    if (art) {
      return {
        passage: chosenSnippet.slice(0, 800),
        articleTitle: art.title,
        articleUrl: art.url,
        score: chosenScore,
      }
    }
  }

  // Snippet wasn't confident enough — scan the full article for a better passage
  const art = summaries[serperResults.indexOf(chosenResult)] ?? await wikiSummary(chosenResult.title)
  if (!art?.extract) return null

  const fullText = await wikiFullText(chosenResult.title)
  const passages = splitPassages(fullText ?? art.extract).slice(0, 25)
  // Include the snippet itself — it might still be the best passage
  if (chosenSnippet.length > 30) passages.unshift(chosenSnippet)

  const passageScores = await rankPassages(query, passages)
  const bestPassage = passageScores[0]

  if (!bestPassage || bestPassage.score < PASSAGE_THRESHOLD) return null

  return {
    passage: bestPassage.passage.slice(0, 800),
    articleTitle: art.title,
    articleUrl: art.url,
    score: bestPassage.score,
  }
}
