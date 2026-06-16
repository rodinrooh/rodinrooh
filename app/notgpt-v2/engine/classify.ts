/**
 * Query classification — principled NLP, no regex word lists, context-aware.
 *
 * Call this with the NORMALIZED query (after normalizeQuery runs) so that
 * "alr great" → "great" → correctly social, not "alr great" compound noun → factual.
 *
 * Social detection logic:
 * - Second-person subject (you/your) + no content topic → greeting/personal → social
 * - Question word + real topic word (not function word) → informational → factual
 * - No content at all (no nouns, no named entities) → social
 * - Has context + 3rd-person pronouns → contextual follow-up → factual
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nlp = require("compromise") as (text: string) => unknown

export type Intent =
  | "social"    // greetings, reactions, personal questions — no lookup
  | "math"      // arithmetic / unit conversion
  | "factual"   // default — Wikipedia passage retrieval

export interface ClassifyContext {
  article?: string
}

const MATH_RE = /^[\d\s+\-*/^().%,=]+$|what\s+is\s+[\d].*[\d]|^\d+\s*[+\-*/]\s*\d+|how\s+much\s+is\s+\d|convert\s+\d/i

// Social function words used in "what is X" / "how is it X" social patterns
// These are position-gated (only checked in specific contexts), not general slang suppression
const SOCIAL_PLACEHOLDER_WORDS = new Set([
  "up", "on", "off", "there", "here", "it", "going", "happening",
  "good", "great", "alright", "ok", "okay", "fine",
])

export function classify(query: string, context?: ClassifyContext): Intent {
  const q = query.trim()
  if (!q) return "social"

  if (MATH_RE.test(q)) return "math"
  if (isRepeatedFiller(q)) return "social"
  if (isSocial(q, context)) return "social"
  if (isPreference(q)) return "social"
  return "factual"
}

/**
 * Repeated-word detection: "yo yo yo" = same short word ≥2x = filler.
 */
function isRepeatedFiller(q: string): boolean {
  const words = q.toLowerCase().split(/\s+/)
  if (words.length < 2) return false
  const unique = new Set(words)
  return unique.size === 1 && words[0].length <= 5
}

/**
 * Social detection.
 *
 * A query is SOCIAL when it carries no informational content AND is not a contextual
 * follow-up about a known entity.
 *
 * Key cases handled:
 *   "how are you"        → second-person "you" + no topic → SOCIAL
 *   "how are you doing"  → second-person "you" → SOCIAL
 *   "what is dark matter"→ "what is" + real topic "dark matter" → FACTUAL
 *   "what is supreme"    → "what is" + "supreme" (not a function word) → FACTUAL
 *   "what's up"          → "what is" + "up" (function word placeholder) → SOCIAL
 *   "how is it going"    → no second-person, no topic noun, short → SOCIAL
 *   "are they still around" + ctx → third-person pronoun + context → FACTUAL
 *   "who founded it" (no ctx) → no topic noun, no 2nd-person → FACTUAL (has content verb)
 */
function isSocial(q: string, context?: ClassifyContext): boolean {
  if (q.length > 35) return false

  try {
    const doc = nlp(q.toLowerCase()) as any

    // Content nouns = topic anchors (excludes pronouns/interjections)
    const contentNouns: number = doc.nouns().not("#Pronoun").not("#Interjection").length
    // Named entities = proper nouns
    const namedEntities: number = doc.match("#ProperNoun").length

    // Definitively informational: has a real topic
    if (contentNouns > 0 || namedEntities > 0) return false

    // Contextual follow-up: user is asking about the previous article entity
    if (context?.article) {
      const hasThirdPerson: boolean = doc.has("(it|they|them|their|its|he|she|him|her|his)")
      if (hasThirdPerson) return false
    }

    // Context entity check: if the context entity name appears in the query (even lowercase
    // after pronoun replacement), it's a factual follow-up about that entity.
    // "are Supreme still around" → "supreme" matches context "Supreme (brand)" → factual
    if (context?.article) {
      const ctxLower = context.article.replace(/\s*\([^)]+\)\s*$/, "").trim().toLowerCase()
      if (ctxLower.length > 2 && q.toLowerCase().includes(ctxLower)) return false
    }

    // SECOND-PERSON PATTERN: asking about "you/we" → social greeting/personal
    // "how are you", "how are we doing", "are you ok", "what do you think"
    const hasSecondPerson: boolean = doc.has("(you|your|yourself|yourselves|we|our|ourselves)")
    if (hasSecondPerson) return true

    // QUESTION-WORD + TOPIC pattern: "what is X" / "who is X" / etc.
    // If X is NOT a placeholder function word → this is an informational question
    const questionVerbMatch = /^(?:what|who|where|when|why|how)\s*(?:'?s|is|are|was|were|does|do|did|can|could|will|would|should|has|have)\s*(.*)/i.exec(q)
    if (questionVerbMatch) {
      const topic = questionVerbMatch[1].trim().toLowerCase()
      if (!topic) return true  // "what is" with nothing after → social
      // If topic is a function/placeholder word → social ("what's up", "how's it going")
      const words = topic.split(/\s+/)
      if (words.every(w => SOCIAL_PLACEHOLDER_WORDS.has(w))) return true
      // Real topic word → factual ("what is dark matter", "what is supreme")
      return false
    }

    // Has a question word at start without copula — "who founded it", "why do we exist"
    // These have informational intent even without explicit nouns
    const startsWithQuestionWord = /^(what|who|where|when|why|how)\b/i.test(q)
    if (startsWithQuestionWord) return false

    // No question word, no content, no second-person — pure social reaction
    // "hey", "ok thanks", "lol", "alright", "alr great" (normalized)
    return true
  } catch {
    return q.length < 8 && !/[a-z]{5}/i.test(q)
  }
}

/**
 * Preference: personal recommendation requests Wikipedia can't answer.
 */
function isPreference(q: string): boolean {
  try {
    const doc = nlp(q) as any
    const hasRecommendVerb: boolean = doc.has("(recommend|suggest|advise)")
    const hasWhatShouldI = /\bwhat\s+should\s+i\b/i.test(q) || /\bshould\s+i\b/i.test(q)
    return hasRecommendVerb || hasWhatShouldI
  } catch {
    return false
  }
}
