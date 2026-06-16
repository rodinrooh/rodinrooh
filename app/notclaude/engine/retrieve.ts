/**
 * Main retrieval pipeline.
 *
 * Architecture (emulates Google Featured Snippets):
 *
 * 1. Serper → check answerBox (Google's own featured snippet) → return directly if clean
 * 2. Collect candidates:
 *    a. Organic result snippets (Google's passage extracts, already quality-filtered)
 *    b. PeopleAlsoAsk snippets (direct Q&A passages)
 *    c. Full pages via Jina reader (parallel fetches, 3s timeout per URL)
 * 3. BM25 pre-filter → top 20 most keyword-relevant passages
 * 4. HF bi-encoder sentence-similarity → final ranking
 * 5. Return best passage above threshold, verbatim from source
 *
 * Every returned passage is verbatim text from a real source. Nothing is generated
 * or paraphrased — the passage field comes directly from Serper/Jina content.
 */

import { serperSearch } from "./serper"
import { rankPassages, bm25Prefilter } from "./rank"
import { fetchPassages } from "./fetch"

const PASSAGE_THRESHOLD = 0.30  // min HF score to return a result
const BM25_PREFILTER_N = 25     // max candidates fed to HF
const MAX_FETCH_URLS = 4        // parallel page fetches

export type RetrievalResult = {
  passage: string
  url: string
  title: string
  score?: number
  usingHF: boolean
}

type Candidate = {
  text: string
  url: string
  title: string
  fromPAA?: boolean  // true if from PeopleAlsoAsk — Google's curated Q&A pairs
}

/** True if text ends with a real sentence boundary (not truncation ellipsis). */
function isComplete(text: string): boolean {
  const t = text.trim()
  if (/\.{2,}$/.test(t)) return false  // ends with ...
  return /[.!?"]$/.test(t)
}

/** Trim text to a sentence boundary, targeting ≤400 chars (featured snippet style). */
function truncateAtSentence(text: string, maxChars = 400): string {
  const cleaned = text.replace(/\s*\.{2,}\s*$/, "").trim()
  if (!cleaned) return text.trim()
  if (cleaned.length <= maxChars) return cleaned

  const candidate = cleaned.slice(0, maxChars)
  const lastEnd = Math.max(
    candidate.lastIndexOf(". "),
    candidate.lastIndexOf("? "),
    candidate.lastIndexOf("! "),
    candidate.lastIndexOf('."'),
  )
  if (lastEnd > maxChars * 0.35) return candidate.slice(0, lastEnd + 1).trim()
  return candidate.trim()
}

export async function retrieveBestPassage(query: string): Promise<RetrievalResult | null> {
  const data = await serperSearch(query)
  if (!data) return null

  // ─── Fast path: answerBox ───────────────────────────────────────────────────
  // answerBox.snippet is verbatim text extracted by Google from the source page.
  // This is already what we want. Return it directly when it's a complete sentence.
  const ab = data.answerBox
  if (ab?.snippet && isComplete(ab.snippet) && ab.snippet.trim().length > 30) {
    return {
      passage: truncateAtSentence(ab.snippet),
      url: ab.link,
      title: ab.title ?? "",
      usingHF: false,
    }
  }
  // snippetHighlighted: Google's bolded phrase within the snippet — the "answer span"
  if (ab?.snippetHighlighted?.length && ab.link) {
    const hl = Array.isArray(ab.snippetHighlighted)
      ? ab.snippetHighlighted.join(" ")
      : String(ab.snippetHighlighted)
    if (hl.length > 30 && isComplete(hl)) {
      return { passage: hl, url: ab.link, title: ab.title ?? "", usingHF: false }
    }
  }

  // ─── Candidate pool ────────────────────────────────────────────────────────
  const candidates: Candidate[] = []
  const seen = new Set<string>()

  const add = (text: string, url: string, title: string, fromPAA = false) => {
    if (!text || !url) return
    // Truncate at last complete sentence BEFORE stripping ellipsis.
    // This converts "Onions produce syn-propanethial-S-oxide. It stimulates the eyes' lach..."
    // into "Onions produce syn-propanethial-S-oxide." — a complete, useful snippet.
    const t = truncateAtSentence(text.replace(/\s*\.{3}\s*$/, "").trim())
    const key = t.slice(0, 60)
    if (!seen.has(key) && t.length > 60) {
      seen.add(key)
      candidates.push({ text: t, url, title, fromPAA })
    }
  }

  // answerBox.snippet (truncated) — add as ranked candidate even if not complete
  if (ab?.snippet && ab.link) add(ab.snippet, ab.link, ab.title ?? "")

  // Organic snippets: Google's best sentence(s) from each result page
  // Scan 9 results to reach past Reddit/Wikipedia-only first results for niche queries
  for (const r of data.organic.slice(0, 9)) {
    if (r.snippet) add(r.snippet, r.link, r.title)
  }

  // PeopleAlsoAsk: Google's curated Q&A pairs — directly relevant topic answers
  for (const paa of data.peopleAlsoAsk.slice(0, 4)) {
    if (paa.snippet) add(paa.snippet, paa.link, paa.title ?? paa.question, true)
  }

  // ─── Direct page fetches (parallel) ────────────────────────────────────────
  // Fetch top pages directly to get full paragraph content, not just Serper
  // snippets (which are often truncated). Each fetch has a built-in 5s timeout.
  const topUrls = data.organic.slice(0, MAX_FETCH_URLS).map(r => r.link)
  const fetchResults = await Promise.allSettled(topUrls.map(url => fetchPassages(url)))

  for (let i = 0; i < fetchResults.length; i++) {
    const r = fetchResults[i]
    if (r.status === "fulfilled" && r.value) {
      const url = topUrls[i]
      const sourceTitle = r.value.title || data.organic[i]?.title || ""
      for (const passage of r.value.passages) {
        add(passage, url, sourceTitle)
      }
    }
  }

  if (!candidates.length) return null

  // ─── Query augmentation for BM25 pre-filter ────────────────────────────────
  // Use answerBox + PAA snippet terms to find passages about the same mechanism.
  // These snippets (even truncated) signal what the correct answer is about —
  // their vocabulary guides BM25 toward passages that discuss the same content.
  const snippetWords = [
    ...(ab?.snippet?.replace(/\s*\.{3}\s*$/, "").split(/\W+/).filter(w => w.length > 4) ?? []),
    // PAA snippets often contain the actual answer vocabulary (gravity, mass, etc.)
    ...data.peopleAlsoAsk.flatMap(paa =>
      (paa.snippet?.replace(/\s*\.{3}\s*$/, "").split(/\W+/).filter(w => w.length > 5) ?? [])
    ),
  ].slice(0, 30)
  const bm25Query = snippetWords.length > 0 ? `${query} ${snippetWords.join(" ")}` : query

  // ─── BM25 pre-filter → HF ranking ──────────────────────────────────────────
  const prefiltered = bm25Prefilter(bm25Query, candidates.map(c => c.text), BM25_PREFILTER_N)

  const { results: ranked, usingHF } = await rankPassages(query, prefiltered)
  if (!ranked.length) return null

  // Two universal passage-quality adjustments for explanation-seeking queries.
  // These apply across ALL topics — they're structural properties of passages,
  // not domain-specific word checks.
  const isWhyQuery = /^why\b/i.test(query.trim())

  const adjustedRanked = ranked.map(r => {
    const c = candidates.find(x => x.text === r.passage)
    let adj = c?.fromPAA ? r.score * 1.15 : r.score

    if (isWhyQuery) {
      // 1. A passage ending with "?" is a question, not an explanation.
      //    Universal: no "why" answer should end in a question.
      if (r.passage.trim().endsWith("?")) adj *= 0.55

      // 2. High second-person density = experiential/descriptive passage, not explanation.
      //    "You feel a sensation... CRYING!" describes an experience; explanations
      //    describe mechanisms. Measured by pronoun count — grammatical, not a word list.
      const youCount = (r.passage.match(/\byou\b/gi) ?? []).length
      const wordCount = r.passage.split(/\s+/).length
      if (wordCount > 0 && youCount / wordCount > 0.07) adj *= 0.65

      // 3. Dummy-subject expletive constructions — meta-commentary, not explanation.
      //    In English linguistics, two constructions use a dummy/expletive subject:
      //      IT-extraposition:    "It is X that Y"   — "It's a common misconception that..."
      //      Existential-THERE:   "There is X that Y" — "There's a lot that experts don't know..."
      //    Both signal that the clause is framing or commenting on a proposition,
      //    not directly explaining it. Detected purely by grammatical position:
      //    {expletive pronoun "it"/"there"} + {copula} + {noun phrase/adverb} + "that"-clause.
      const firstWord = r.passage.trim().toLowerCase().match(/^(\w+'?\w*)\b/)?.[1] ?? ""
      const isExpletive = (firstWord === "it" || firstWord === "its" ||
                           firstWord === "there" || firstWord === "theres") &&
                          r.passage.toLowerCase().includes(" that ")
      if (isExpletive) adj *= 0.65
    }

    return { ...r, score: adj }
  }).sort((a, b) => b.score - a.score)

  // Walk ranked results in score order; return the first COMPLETE passage above threshold.
  // Truncated passages (mid-sentence, no terminal punctuation) are useful for ranking
  // but must not be returned as the final answer.
  let best: { passage: string; score: number } | null = null
  let bestCandidate: Candidate | null = null

  for (const r of adjustedRanked) {
    if (r.score < PASSAGE_THRESHOLD) break  // sorted descending; no point continuing
    const c = candidates.find(x => x.text === r.passage)
    if (!c) continue
    const trimmed = r.passage.trim()
    if (isComplete(trimmed)) {
      best = r
      bestCandidate = c
      break
    }
  }

  if (!best || !bestCandidate) return null

  return {
    passage: truncateAtSentence(bestCandidate.text),
    url: bestCandidate.url,
    title: bestCandidate.title,
    score: best.score,
    usingHF,
  }
}
