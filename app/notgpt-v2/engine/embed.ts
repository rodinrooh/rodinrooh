/**
 * Sentence similarity via HF Inference API (sentence-transformers/all-MiniLM-L6-v2).
 * Falls back to recall-based content-word scoring if HF is unavailable.
 *
 * The fallback uses `compromise` (already installed) to extract semantic content words
 * (nouns, verbs, adjectives) from the query — no hardcoded stopword list.
 * This is what fixes the "You" grammar article collision: "what happens if you swallow gum"
 * extracts {happens, swallow, gum}, which score 0 against the "You" pronoun article.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
type CompromiseView = { out: (fmt: "array") => string[]; not: (tag: string) => CompromiseView }
const nlp = require("compromise") as (text: string) => {
  nouns: () => CompromiseView
  verbs: () => CompromiseView
  adjectives: () => CompromiseView
}

const HF_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
const HF_API_URL = `https://api-inference.huggingface.co/models/${HF_MODEL}`
const HF_TOKEN = process.env.HF_TOKEN

/**
 * Extract semantic content words from text using NLP POS tagging.
 * Returns nouns + non-auxiliary verbs + adjectives — no hardcoded stopword list needed.
 * "what happens if you swallow gum" → ["happens", "swallow", "gum"]
 * "why do my fingers wrinkle in the bath" → ["fingers", "wrinkle", "bath"]
 */
function contentWords(text: string): string[] {
  try {
    const doc = nlp(text)
    const nouns = doc.nouns().out("array") as string[]
    // Explicitly exclude auxiliaries (#Auxiliary) and modals (#Modal) — "does", "is", "are",
    // "has", "will", "should" etc. are query scaffolding, not semantic content words.
    const verbs = doc.verbs().not("#Auxiliary").not("#Modal").out("array") as string[]
    const adjs = doc.adjectives().out("array") as string[]
    return [...nouns, ...verbs, ...adjs]
      .map(w => w.toLowerCase().replace(/[^a-z0-9]/g, ""))
      .filter(w => w.length > 2)
  } catch {
    // Compromise unavailable: fall back to length-based filtering (words > 4 chars tend to be content words)
    return text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 4)
  }
}

/**
 * Recall scoring: what fraction of semantic query words appear in the passage?
 * 1.0 = all query content words found, 0 = none found.
 * Uses morphological prefix matching for plurals/conjugations.
 */
function recallScore(query: string, passage: string): number {
  const qWords = [...new Set(contentWords(query))]
  if (!qWords.length) return 0
  const pLow = passage.toLowerCase().replace(/[^a-z0-9 ]/g, " ")

  let matched = 0
  for (const q of qWords) {
    const stem = q.slice(0, Math.min(q.length, 5))
    if (pLow.includes(q) || (q.length >= 5 && new RegExp(`\\b${stem}`).test(pLow))) {
      matched++
    }
  }
  return matched / qWords.length
}

export async function rankPassages(
  query: string,
  passages: string[]
): Promise<Array<{ passage: string; score: number }>> {
  if (!passages.length) return []

  const trimmed = passages.map(p => p.slice(0, 512))

  // Try HF Inference API (same model, runs on HF servers — no local binary needed)
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (HF_TOKEN) headers["Authorization"] = `Bearer ${HF_TOKEN}`

    const res = await fetch(HF_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        inputs: { source_sentence: query.slice(0, 512), sentences: trimmed },
        options: { wait_for_model: true },
      }),
      signal: AbortSignal.timeout(10000),
    })

    if (res.ok) {
      const scores = await res.json() as number[]
      if (Array.isArray(scores) && scores.length === passages.length) {
        return passages
          .map((p, i) => ({ passage: p, score: scores[i] }))
          .sort((a, b) => b.score - a.score)
      }
    }
  } catch { /* fall through to BM25 */ }

  // Fallback: content-word recall scoring (NLP-based, no stopword list)
  return passages
    .map(p => ({ passage: p, score: recallScore(query, p) }))
    .sort((a, b) => b.score - a.score)
}
