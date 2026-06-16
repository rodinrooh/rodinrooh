/**
 * Cross-encoder reranking via BAAI/bge-reranker-v2-m3.
 *
 * Unlike the bi-encoder (which compresses query and passage into independent
 * vectors and measures distance), a cross-encoder processes both inputs
 * TOGETHER in a single forward pass. It can model the question-answer
 * relationship directly — "does this passage answer this specific question?"
 * rather than "are these texts about the same topic?"
 *
 * This fixes the core passage-selection failure: "why do my knuckles crack"
 * returning the harm-assessment paragraph instead of the mechanism paragraph.
 * bge-reranker-v2-m3 trained on QA quality data correctly ranks the gas-bubble
 * explanation above the "it's harmless" passage without any query augmentation.
 *
 * API: router.huggingface.co/hf-inference/models/BAAI/bge-reranker-v2-m3
 * Format: POST [{"text": query, "text_pair": doc}, ...]
 * Output: [[{"label": "LABEL_0", "score": float}, ...]]  (one score per pair, in order)
 */

const RERANKER_URL =
  "https://router.huggingface.co/hf-inference/models/BAAI/bge-reranker-v2-m3"

export type RerankResult = { passage: string; score: number }

/**
 * Rerank passages against a query using a cross-encoder.
 * Returns passages sorted by relevance score descending.
 * Falls back to original order (no reranking) if the API is unavailable.
 */
export async function rerankPassages(
  query: string,
  passages: string[]
): Promise<RerankResult[]> {
  if (!passages.length) return []

  const token = process.env.HF_TOKEN
  if (!token) return passages.map((p, i) => ({ passage: p, score: passages.length - i }))

  try {
    const inputs = passages.map(p => ({
      text: query.slice(0, 512),
      text_pair: p.slice(0, 512),
    }))

    const res = await fetch(RERANKER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs, options: { wait_for_model: true } }),
      signal: AbortSignal.timeout(12_000),
    })

    if (!res.ok) {
      return passages.map((p, i) => ({ passage: p, score: passages.length - i }))
    }

    // Response shape: [[{"label":"LABEL_0","score":float}, ...]]
    // Outer array always has 1 element; inner array has one entry per passage, in order.
    const data = (await res.json()) as Array<Array<{ label: string; score: number }>>
    const scores = data[0]

    if (!Array.isArray(scores) || scores.length !== passages.length) {
      return passages.map((p, i) => ({ passage: p, score: passages.length - i }))
    }

    return passages
      .map((p, i) => ({ passage: p, score: scores[i]?.score ?? 0 }))
      .sort((a, b) => b.score - a.score)
  } catch {
    return passages.map((p, i) => ({ passage: p, score: passages.length - i }))
  }
}
