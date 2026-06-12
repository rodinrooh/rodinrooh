export type GateVerdict = "answer" | "answer_hedged" | "clarify" | "decline"

export type SearchHit = {
  title: string
  description?: string
  snippet?: string
  rank: number // 0-indexed
}

export type GateResult = {
  verdict: GateVerdict
  score: number
  hedgeTitle?: string // if verdict=answer_hedged, the title we're hedging on
}

// Stopwords to remove before token comparison
const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been",
  "of", "in", "on", "at", "to", "for", "with", "by", "from",
  "that", "this", "it", "its", "and", "or", "but", "not",
  "have", "has", "had", "do", "does", "did",
  "will", "would", "could", "should",
  "their", "they", "them", "his", "her", "our", "we", "us",
  "who", "what", "which", "when", "where", "how", "why",
])

/**
 * Applies a naive stem:
 * - strips trailing 's' or 'es' if word length > 4
 * - strips trailing 'ing' if word length > 5
 */
function naiveStem(word: string): string {
  if (word.length > 5 && word.endsWith("ing")) {
    return word.slice(0, -3)
  }
  if (word.length > 4 && word.endsWith("es")) {
    return word.slice(0, -2)
  }
  if (word.length > 4 && word.endsWith("s")) {
    return word.slice(0, -1)
  }
  return word
}

/**
 * Extracts content tokens from text:
 * - Lowercase
 * - Split on non-word characters
 * - Remove stopwords
 * - Apply naive stem
 */
export function contentTokens(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .normalize("NFKC")
    .split(/\W+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(naiveStem)
    .filter((t) => t.length > 0)

  return new Set(tokens)
}

/**
 * Computes Jaccard similarity between two token sets.
 * Returns 0 if both sets are empty.
 */
export function tokenJaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1.0
  if (a.size === 0 || b.size === 0) return 0.0

  let intersectionSize = 0
  for (const token of a) {
    if (b.has(token)) intersectionSize++
  }

  const unionSize = a.size + b.size - intersectionSize
  return unionSize === 0 ? 0 : intersectionSize / unionSize
}

/**
 * Normalizes a string for exact-match comparison:
 * lowercase, collapse whitespace, strip punctuation.
 */
function normalizeForExact(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * The core entity gate function.
 * Determines how confidently we can answer about the top search hit.
 *
 * Algorithm:
 * - No hits → decline
 * - Exact title match (normalized) → answer, score 1.0
 * - Rank 0 hit: compute token Jaccard (stopwords removed)
 *   - ≥0.6 AND has description → answer_hedged (hedgeTitle = hit.title)
 *   - ≥0.35 → clarify
 *   - <0.35 → decline
 */
export function entityGate(query: string, hits: SearchHit[]): GateResult {
  if (!hits || hits.length === 0) {
    return { verdict: "decline", score: 0 }
  }

  const normalizedQuery = normalizeForExact(query)
  const queryTokens = contentTokens(query)

  // Check for exact title match (any hit, but rank 0 takes priority)
  for (const hit of hits) {
    const normalizedTitle = normalizeForExact(hit.title)
    if (normalizedQuery === normalizedTitle) {
      return {
        verdict: "answer",
        score: 1.0,
        hedgeTitle: hit.title,
      }
    }
  }

  // Evaluate rank-0 hit with Jaccard similarity
  const topHit = hits.find((h) => h.rank === 0) ?? hits[0]
  const titleTokens = contentTokens(topHit.title)

  // Also consider description tokens for scoring
  const descriptionTokens = topHit.description
    ? contentTokens(topHit.description)
    : new Set<string>()

  // Combine title and description tokens for scoring
  const combinedTokens = new Set([...titleTokens, ...descriptionTokens])

  const titleJaccard = tokenJaccard(queryTokens, titleTokens)
  const combinedJaccard = tokenJaccard(queryTokens, combinedTokens)

  // Use the better of the two scores
  const score = Math.max(titleJaccard, combinedJaccard * 0.8)

  if (score >= 0.6) {
    // High confidence, but we hedge if description is present
    if (topHit.description && topHit.description.length > 0) {
      return {
        verdict: "answer_hedged",
        score,
        hedgeTitle: topHit.title,
      }
    }
    // No description — still answer but with lower confidence
    return {
      verdict: "answer_hedged",
      score,
      hedgeTitle: topHit.title,
    }
  }

  if (score >= 0.35) {
    return {
      verdict: "clarify",
      score,
      hedgeTitle: topHit.title,
    }
  }

  return {
    verdict: "decline",
    score,
  }
}
