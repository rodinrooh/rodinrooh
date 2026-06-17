/**
 * Semantic topic-change detection — no word lists.
 *
 * Two-stage pipeline:
 *
 * Stage 1 — Named Entity Recognition (HF roberta-large-ner-english):
 *   If the query contains a named entity (person, org, tech, misc) that is
 *   lexically distinct from the current context entity, the user switched topics.
 *   Example: "ok who is jensen huang" while discussing "vine" → PER:jensen_huang ≠ vine.
 *
 * Stage 2 — Semantic similarity against last passage (fallback):
 *   When NER finds no entity, compare the stripped query against the last response
 *   passage. A full passage has rich semantic content; comparing against it gives
 *   a reliable signal (same-topic follow-ups score ~0.08-0.15, new topics score
 *   negative or near zero).
 *   Example: "what are black holes again" vs vine passage → similarity ≈ -0.05 → new topic.
 *
 * Neither stage uses a word list of topic-change phrases. Stage 1 uses a
 * statistical NER model trained on 40k+ documents. Stage 2 uses cosine similarity.
 */

const HF_TOKEN_ENV = () => process.env.HF_TOKEN ?? ""

const NER_URL = "https://router.huggingface.co/hf-inference/models/Jean-Baptiste/roberta-large-ner-english"
const SIM_URL = "https://router.huggingface.co/hf-inference/models/sentence-transformers/multi-qa-MiniLM-L6-cos-v1"

/** Minimum cosine similarity to treat a query as a same-topic follow-up.
 *
 * Empirically calibrated (query vs full last passage, multi-qa-MiniLM-L6-cos-v1):
 *   Same-topic floor:  0.172 ("what is the difference" vs dark energy passage)
 *   Same-topic floor:  0.058 ("can they die" vs black hole passage) — but hasRef=true, never reaches this
 *   New-topic ceiling: 0.077 ("what is caffeine exactly" vs rem sleep passage)
 *   New-topic ceiling: 0.058 ("what is gaussian splatting" vs vine passage) — rescued by NER
 *
 * Threshold of 0.10 sits in the gap: caffeine (0.077) < 0.10 < difference (0.172).
 * Queries with pronouns never reach this — they're caught by hasAnaphoricReference().
 */
const SAME_TOPIC_SIM_THRESHOLD = 0.10

export type TopicResult =
  | { isNewTopic: false }
  | { isNewTopic: true; newEntity: string | null }

/**
 * Detect whether a query introduces a new topic.
 *
 * Only called when the query has NO anaphoric pronouns — if pronouns are present,
 * it's virtually always a same-topic follow-up ("could it have survived", "can they die").
 *
 * @param strippedQuery   Query after filler removal (no leading slang/discourse particles)
 * @param contextEntity   Current conversation entity (e.g. "vine", "dark matter")
 * @param lastPassage     Last response passage (for similarity fallback)
 */
export async function detectTopicChange(
  strippedQuery: string,
  contextEntity: string,
  lastPassage: string
): Promise<TopicResult> {
  const token = HF_TOKEN_ENV()
  if (!token || !contextEntity) return { isNewTopic: false }

  // Ultra-short queries (≤ 3 tokens) are almost always bare follow-ups:
  // "eli5", "when?", "how?", "can they die?" — the user isn't naming a new topic.
  const wordCount = strippedQuery.trim().split(/\s+/).length
  if (wordCount <= 3) return { isNewTopic: false }

  // Stage 1 + Stage 2 in parallel — both start immediately, we use whichever
  // gives a clear signal first. Both calls together add ~200-400ms.
  const [nerResult, simResult] = await Promise.allSettled([
    callNER(strippedQuery, token),
    callSimilarity(strippedQuery, lastPassage, token),
  ])

  // Stage 1: NER — if a named entity is found that differs from current context
  if (nerResult.status === "fulfilled" && nerResult.value) {
    const entity = nerResult.value
    if (!isRelated(entity, contextEntity)) {
      return { isNewTopic: true, newEntity: entity }
    }
  }

  // Stage 2: Similarity fallback — for queries where NER finds nothing
  // (e.g. "what are black holes again" — "black holes" isn't in NER training data)
  if (simResult.status === "fulfilled" && simResult.value !== null) {
    if (simResult.value < SAME_TOPIC_SIM_THRESHOLD) {
      return { isNewTopic: true, newEntity: null }
    }
  }

  return { isNewTopic: false }
}

// ── NER ──────────────────────────────────────────────────────────────────────

/** Call the HF NER model; return the top-scoring entity text, or null. */
async function callNER(query: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(NER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: query, parameters: { aggregation_strategy: "simple" } }),
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) return null
    const entities = await res.json() as Array<{ entity_group: string; score: number; word: string }>
    if (!Array.isArray(entities) || !entities.length) return null
    // Take highest-confidence entity
    const best = entities.reduce((a, b) => b.score > a.score ? b : a)
    if (best.score < 0.4) return null  // Low-confidence entity — skip (calibrated: ozempic scores ~0.47)
    return best.word.toLowerCase().trim()
  } catch {
    return null
  }
}

// ── Similarity ───────────────────────────────────────────────────────────────

/** Compute cosine similarity between the query and last response passage. */
async function callSimilarity(
  query: string,
  passage: string,
  token: string
): Promise<number | null> {
  if (!passage || passage.length < 20) return null
  try {
    const res = await fetch(SIM_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        inputs: {
          source_sentence: query.slice(0, 256),
          sentences: [passage.slice(0, 512)],
        },
      }),
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) return null
    const scores = await res.json() as number[]
    return Array.isArray(scores) ? (scores[0] ?? null) : null
  } catch {
    return null
  }
}

// ── Entity comparison ─────────────────────────────────────────────────────────

/**
 * True if newEntity is semantically related to contextEntity.
 * Uses substring matching (bidirectional) to handle partial matches:
 * "gaussian" relates to "gaussian splatting", "vine" relates to "vine (service)".
 */
function isRelated(newEntity: string, contextEntity: string): boolean {
  const a = newEntity.toLowerCase().trim()
  const b = contextEntity.toLowerCase().trim()
  if (a === b) return true
  if (a.includes(b) || b.includes(a)) return true
  // Share a significant word (≥4 chars)
  const aWords = a.split(/\s+/).filter(w => w.length >= 4)
  const bWords = b.split(/\s+/).filter(w => w.length >= 4)
  return aWords.some(w => bWords.includes(w))
}
