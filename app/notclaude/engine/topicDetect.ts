/**
 * Semantic topic-change detection — no word lists.
 *
 * Three-stage pipeline:
 *
 * Stage 1 — Named Entity Recognition (HF roberta-large-ner-english):
 *   If the query contains a named entity (person, org, tech, misc) that is
 *   lexically distinct from the current context entity, the user switched topics.
 *   Coverage: PERSON, ORG, LOC, MISC in CoNLL-2003 training data.
 *
 * Stage 1.5 — compromise.js topics() fallback:
 *   roberta-ner is trained on CoNLL-2003 which covers people/orgs/places but
 *   misses scientific/food/chemical concepts ("caffeine", "photosynthesis",
 *   "spacex rocket engine"). compromise.js topics() catches these via its own
 *   NLP pipeline. If topics() finds a concept not in current context → new topic.
 *   Research basis: TREC CAsT survey notes NER-based signals should take priority
 *   over similarity when a novel named concept is present (arXiv 2201.08808).
 *
 * Stage 2 — Semantic similarity against last passage (fallback):
 *   When neither NER stage finds a new entity, cosine similarity decides.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nlpLib = require("compromise") as (text: string) => { topics(): { out(f: "array"): string[]; found: boolean } }

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

  // Single-token queries ("when", "eli5") are bare follow-ups — never new topics.
  // Multi-token queries with pronouns are caught by hasAnaphoricReference() before
  // this function is called. Removing the ≤ 3 guard: "what is caffeine" (3 words)
  // must reach the noun-novelty check to be detected as a new topic.
  const wordCount = strippedQuery.trim().split(/\s+/).length
  if (wordCount <= 1) return { isNewTopic: false }

  // Stage 1 + Stage 2 in parallel — both start immediately, we use whichever
  // gives a clear signal first. Both calls together add ~200-400ms.
  const [nerResult, simResult] = await Promise.allSettled([
    callNER(strippedQuery, token),
    callSimilarity(strippedQuery, lastPassage, token),
  ])

  // Stage 1: HF NER — covers PERSON, ORG, LOC, MISC
  if (nerResult.status === "fulfilled" && nerResult.value) {
    const entity = nerResult.value
    if (!isRelated(entity, contextEntity)) {
      return { isNewTopic: true, newEntity: entity }
    }
  }

  // Stage 1.5: Content noun novelty — catches scientific/food/product concepts
  // that roberta-ner misses ("caffeine", "photosynthesis", "tesla").
  // compromise.topics() only works for capitalized proper nouns; nouns() is broader.
  //
  // Guard: "what about X" is a subject shift within topic (e.g., "what about algae"
  // in photosynthesis conversation), NOT a topic change. Let it fall through to
  // resolveQuery's "what about X" handler to extract X as the new subject.
  //
  // Noun ≥ 5 chars: filters short function words ("them", "this") while catching
  // specific concepts ("algae", "tesla", "caffeine"). Noun must not appear in
  // the current context entity or last passage (novel concept = new topic).
  // Research: TREC CAsT 2021 — novel named concepts are stronger topic signals
  // than cosine similarity (CAsT 2021 overview, arXiv 2201.08808).
  const isWhatAbout = /^(?:what|how)\s+about\s+/i.test(strippedQuery)
  if (!isWhatAbout) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nlpAny = nlpLib as any
      const doc = nlpAny(strippedQuery)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawNouns: string[] = doc.nouns().not("#Pronoun").out("array") as string[]
      for (const noun of rawNouns) {
        const n = noun.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim()
        if (n.length < 5) continue
        if (contextEntity.toLowerCase().includes(n)) continue
        if (lastPassage.toLowerCase().includes(n)) continue
        // Exclude indefinite/mass nouns via tag: "anything", "something", "nothing",
        // "everything" get Uncountable tag in compromise — they are structural pronouns,
        // not named concepts. Using POS tag avoids a word list (works for misspellings
        // too, since compromise re-tags morphologically similar forms).
        const nounTerms = nlpAny(noun).json()[0]?.terms ?? []
        const isIndefinite = nounTerms.some((t: { tags?: string[] }) => t.tags?.includes("Uncountable"))
        if (isIndefinite) continue
        return { isNewTopic: true, newEntity: n }
      }
    } catch { /* ignore */ }
  }

  // Stage 2: Similarity fallback — for queries where neither NER stage finds a new entity
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
