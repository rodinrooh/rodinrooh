/**
 * Sentence similarity via all-MiniLM-L6-v2 (23MB quantized, ONNX).
 * Not generative — encodes text to a 384-dim vector and computes cosine similarity.
 * Bridges vocabulary gaps that BM25 can't: "planes stay up" ↔ "aerodynamic lift".
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { pipeline, env } = require("@xenova/transformers")

// Cache model per process — warm after first request
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _embedder: any = null

// Suppress Xenova's verbose console output
env.allowLocalModels = false

async function getEmbedder() {
  if (!_embedder) {
    _embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
      quantized: true,
    })
  }
  return _embedder
}

function meanPool(tensor: number[][]): number[] {
  const dim = tensor[0].length
  const mean = new Array(dim).fill(0)
  for (const vec of tensor) {
    for (let i = 0; i < dim; i++) mean[i] += vec[i]
  }
  return mean.map(v => v / tensor.length)
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8)
}

export async function embedText(text: string): Promise<number[]> {
  const embedder = await getEmbedder()
  const output = await embedder(text.slice(0, 512), { pooling: "mean", normalize: true })
  // output.data is a flat Float32Array of shape [1, 384]
  const arr = Array.from(output.data as Float32Array)
  return arr as number[]
}

export async function similarityScore(query: string, passage: string): Promise<number> {
  const [qv, pv] = await Promise.all([embedText(query), embedText(passage)])
  return cosine(qv, pv)
}

/**
 * Score multiple passages against one query embedding.
 * More efficient than calling similarityScore N times.
 */
export async function rankPassages(
  query: string,
  passages: string[]
): Promise<Array<{ passage: string; score: number }>> {
  if (!passages.length) return []
  const qv = await embedText(query)
  const scores = await Promise.all(
    passages.map(async p => {
      const pv = await embedText(p)
      return { passage: p, score: cosine(qv, pv) }
    })
  )
  return scores.sort((a, b) => b.score - a.score)
}
