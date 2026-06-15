/**
 * Sentence similarity via HF Inference API (sentence-transformers/all-MiniLM-L6-v2).
 *
 * Same model as before, but runs on Hugging Face's servers instead of locally.
 * This works in Vercel serverless — no native binaries, no model download.
 * Free tier: ~1000 req/day unauthenticated, more with a free HF token.
 *
 * Falls back to BM25 keyword overlap if HF is unavailable.
 */

const HF_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
const HF_API_URL = `https://api-inference.huggingface.co/models/${HF_MODEL}`
const HF_TOKEN = process.env.HF_TOKEN  // optional — increases rate limit, set in Vercel env

// BM25-style keyword overlap fallback (no external deps, always works)
function bm25Score(query: string, passage: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2)
  const qWords = new Set(normalize(query))
  const pWords = normalize(passage)
  if (!qWords.size || !pWords.length) return 0
  const hits = pWords.filter(w => qWords.has(w) || [...qWords].some(q => w.startsWith(q.slice(0, 5)) && q.length >= 5))
  return hits.length / Math.sqrt(qWords.size * pWords.length)
}

/**
 * Rank passages by semantic similarity to query using HF Inference API.
 * The API accepts source_sentence + sentences[] and returns similarity scores directly.
 */
export async function rankPassages(
  query: string,
  passages: string[]
): Promise<Array<{ passage: string; score: number }>> {
  if (!passages.length) return []

  // Trim passages to 512 chars (model input limit)
  const trimmed = passages.map(p => p.slice(0, 512))

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
      signal: AbortSignal.timeout(8000),
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

  // Fallback: BM25 keyword overlap (no external deps)
  return passages
    .map(p => ({ passage: p, score: bm25Score(query, p) }))
    .sort((a, b) => b.score - a.score)
}
