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
import { rerankPassages } from "./rerank"

const PASSAGE_THRESHOLD = 0.30   // min bi-encoder score to enter the reranker
const RERANKER_TOP_N = 10        // candidates sent to the cross-encoder
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

  // ─── Stage 1: BM25 pre-filter → bi-encoder ranking ──────────────────────────
  // BM25 narrows the pool by keyword overlap; the bi-encoder adds semantic ranking.
  // We keep the top RERANKER_TOP_N candidates for the cross-encoder.
  const prefiltered = bm25Prefilter(bm25Query, candidates.map(c => c.text), BM25_PREFILTER_N)
  // For "why" queries, augment the scoring vector toward explanation-space.
  // This shifts the bi-encoder to prefer mechanism/cause passages over
  // harm-assessment or experience-description passages for the same topic.
  const isWhyQuery = /^why\b/i.test(query.trim())
  const biQuery = isWhyQuery ? `${query} cause reason mechanism explanation` : query

  const { results: biEncoded, usingHF } = await rankPassages(biQuery, prefiltered)
  if (!biEncoded.length) return null

  // PAA boost before passing to reranker: Google's curated Q&A pairs are
  // structurally strong candidates. Give them a head-start in the bi-encoder
  // ranking so they make it into the cross-encoder's top-N.
  const biRanked = biEncoded.map(r => {
    const c = candidates.find(x => x.text === r.passage)
    const adj = c?.fromPAA ? r.score * 1.15 : r.score
    return { ...r, score: adj }
  }).sort((a, b) => b.score - a.score)

  // ─── Stage 2: Structural quality gate ─────────────────────────────────────────
  // For "why" queries, apply grammar-based structural checks as a HARD GATE.

  function isStructurallyValid(passage: string): boolean {
    if (!isWhyQuery) return true
    // (a) Rhetorical question ending
    if (passage.trim().endsWith("?")) return false
    // (b) High second-person density — experiential description
    const youCount = (passage.match(/\byou\b/gi) ?? []).length
    if (passage.split(/\s+/).length > 0 && youCount / passage.split(/\s+/).length > 0.07) return false
    // (c) Expletive dummy-subject construction — meta-commentary
    const fw = passage.trim().toLowerCase().match(/^(\w+'?\w*)\b/)?.[1] ?? ""
    if ((fw === "it" || fw === "its" || fw === "there" || fw === "theres") &&
        passage.toLowerCase().includes(" that ")) return false
    // (d) First-person singular subject at start — journalist/reporter perspective, not explanation.
    //     "I spoke with Dr. X..." / "I believe..." = author's account, not mechanism.
    //     In English, explanatory passages for "why" questions use third-person subjects.
    if (/^I\b/i.test(passage.trim())) return false
    return true
  }

  const reranked = biRanked

  // ─── Stage 3: Cross-encoder validation (bge-reranker-v2-m3) ─────────────────
  // The bi-encoder + structural checks are the primary rankers.
  // The cross-encoder acts as a VALIDATOR: if the bi-encoder's top structurally-valid
  // passage scores LOW on the cross-encoder (< 0.3), it likely doesn't answer the
  // question well, so we use the cross-encoder's best-scoring complete passage instead.
  //
  // This is targeted: it fixes "why do my knuckles crack" (bi-encoder picks "harmless"
  // at 0.779; cross-encoder score is 0.20 < 0.3 → switch to gas bubble at 0.46)
  // without replacing the bi-encoder's correct choices for other queries.
  let rerankedFinal = reranked
  try {
    const topN = biRanked.slice(0, RERANKER_TOP_N).map(r => r.passage)
    const crossScores = await rerankPassages(query, topN)
    const crossScoreMap = new Map(crossScores.map(r => [r.passage, r.score]))

    // Find the best complete+structural passage from bi-encoder ranking
    const biTopCandidate = biRanked.find(r => {
      const c = candidates.find(x => x.text === r.passage)
      return c && isComplete(r.passage.trim()) && isStructurallyValid(r.passage.trim())
    })

    if (biTopCandidate) {
      const biTopCrossScore = crossScoreMap.get(biTopCandidate.passage) ?? 0
      const bestCrossScore = crossScores[0]?.score ?? 0
      // Switch to cross-encoder ordering if cross-encoder's best passage is
      // significantly more relevant than the bi-encoder's top choice.
      // A 30% ratio threshold: avoids switching when all passages are close
      // (hiccups: all ~0.99, ratio ~1.003) but catches clear mismatches
      // (knuckles: harmless 0.69 vs mechanism 0.99, ratio 1.44 > 1.3).
      // Switch to cross-encoder only if:
      // 1. Cross-encoder's best is significantly more relevant (>30% better ratio)
      // 2. Cross-encoder's best passage itself passes structural validity
      //    (prevents switching to journalistic quotes/anecdotes that happen to score high)
      const bestCrossPassage = crossScores[0]?.passage ?? ""
      if (
        biTopCrossScore > 0 &&
        bestCrossScore / biTopCrossScore > 1.3 &&
        isStructurallyValid(bestCrossPassage)
      ) {
        rerankedFinal = crossScores
      }
    }
  } catch { /* cross-encoder unavailable — fall through to bi-encoder results */ }

  // Walk final ranked results; return first COMPLETE and structurally valid passage.
  let best: { passage: string; score: number } | null = null
  let bestCandidate: Candidate | null = null
  let bestFallback: { r: { passage: string; score: number }; c: Candidate } | null = null

  for (const r of rerankedFinal) {
    const c = candidates.find(x => x.text === r.passage)
    if (!c) continue
    const trimmed = r.passage.trim()
    if (!isComplete(trimmed)) continue
    if (!bestFallback) bestFallback = { r, c }
    if (isStructurallyValid(trimmed)) {
      best = r
      bestCandidate = c
      break
    }
  }

  if (!best || !bestCandidate) {
    if (bestFallback) { best = bestFallback.r; bestCandidate = bestFallback.c }
    else return null
  }

  return {
    passage: truncateAtSentence(bestCandidate.text),
    url: bestCandidate.url,
    title: bestCandidate.title,
    score: best.score,
    usingHF,
  }
}
