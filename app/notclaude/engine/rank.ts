/**
 * Passage ranking via HF sentence-similarity (all-MiniLM-L6-v2).
 *
 * Falls back to BM25 keyword recall scoring if HF is unavailable or slow.
 * The fallback uses compromise for POS-based content word extraction.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nlp = require("compromise") as (text: string) => Record<string, unknown>

const HF_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
const HF_API_URL = `https://router.huggingface.co/hf-inference/models/${HF_MODEL}`

function contentWords(text: string): string[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = nlp(text) as any
    return (doc
      .not("#Pronoun")
      .not("#Preposition")
      .not("#Conjunction")
      .not("#Auxiliary")
      .not("#Modal")
      .not("#Determiner")
      .not("#QuestionWord")
      .terms()
      .out("array") as string[])
      .flatMap((w: string) => w.toLowerCase().split(/\W+/))
      .filter((w: string) => w.length > 2)
  } catch {
    return text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 3)
  }
}

function bm25Score(query: string, passage: string): number {
  const qWords = [...new Set(contentWords(query))]
  if (!qWords.length) return 0
  const pLow = passage.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ")
  let matched = 0
  for (const q of qWords) {
    const stem = q.endsWith("e") ? q.slice(0, -1) : q
    const forms = new Set([q, stem + "s", stem + "es", stem + "ing", stem + "ed", stem + "er"])
    if (q.endsWith("s") && q.length > 4) forms.add(q.slice(0, -1))
    if (q.endsWith("ing") && q.length > 5) forms.add(q.slice(0, -3))
    if ([...forms].some(f => new RegExp(`\\b${f}\\b`).test(pLow))) matched++
  }
  return matched / qWords.length
}

export type RankedPassage = { passage: string; score: number }
export type RankResult = { results: RankedPassage[]; usingHF: boolean }

export async function rankPassages(query: string, passages: string[]): Promise<RankResult> {
  if (!passages.length) return { results: [], usingHF: false }

  const token = process.env.HF_TOKEN
  const trimmed = passages.map(p => p.slice(0, 512))

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (token) headers["Authorization"] = `Bearer ${token}`

    const res = await fetch(HF_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        inputs: { source_sentence: query.slice(0, 512), sentences: trimmed },
        options: { wait_for_model: true },
      }),
      signal: AbortSignal.timeout(15_000),
    })

    if (res.ok) {
      const scores = await res.json() as number[]
      if (Array.isArray(scores) && scores.length === passages.length) {
        return {
          usingHF: true,
          results: passages
            .map((p, i) => ({ passage: p, score: scores[i] }))
            .sort((a, b) => b.score - a.score),
        }
      }
    }
  } catch { /* fall through */ }

  return {
    usingHF: false,
    results: passages
      .map(p => ({ passage: p, score: bm25Score(query, p) }))
      .sort((a, b) => b.score - a.score),
  }
}

/**
 * BM25 pre-filter: pick the topN passages with highest keyword recall.
 * Used to narrow the candidate pool before the HF call.
 */
export function bm25Prefilter(query: string, passages: string[], topN: number): string[] {
  if (passages.length <= topN) return passages
  return passages
    .map(p => ({ p, score: bm25Score(query, p) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(x => x.p)
}
