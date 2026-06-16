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

/**
 * Entity/topic presence check — replaces SOCIAL_PLACEHOLDER_WORDS list.
 *
 * Google's approach (from research): queries are social when they have no
 * resolvable knowledge entity. "what's up" → "up" has no entity. "what is
 * dark matter" → "dark matter" resolves as a physics concept.
 *
 * We approximate this structurally: if the topic after "what is / how is" etc.
 * has NO content noun and NO named entity → it's a placeholder → social.
 * "up", "going", "there", "it going" → adverbs/particles/pronouns → social
 * "dark matter", "supreme", "nasa" → noun phrases / named entities → factual
 *
 * No word list. Uses NLP POS structure only.
 */
/**
 * Check if the topic word(s) after "what is / how is" are real content vs placeholder.
 *
 * Research finding (Agent 1 + 4): The key signal is entity/noun presence.
 * "up", "there", "it going" → particles/pronouns/adverbs → placeholder → social
 * "dark matter", "supreme" → nouns/concepts → real topic → factual
 *
 * Edge case: "supreme" lowercase → tagged as adjective by compromise.js, not noun.
 * Fix: substantial words (≥5 chars each) that aren't recognized as pronouns/adverbs
 * are likely content words even if tagged as adjectives. This covers proper nouns
 * typed in lowercase ("supreme", "nasa") and technical terms.
 */
function isPlaceholderTopic(topic: string): boolean {
  if (!topic || topic.trim().length === 0) return true
  try {
    const doc = nlp(topic.toLowerCase()) as any
    // Has a content noun (not pronoun) → real topic
    if (doc.nouns().not("#Pronoun").length > 0) return false
    // Has a named entity → real topic
    if (doc.match("#ProperNoun").length > 0) return false
    // Substantial content word (≥5 chars, not a function word OR verb) → likely a real topic.
    // "supreme" (7 chars, adjective but substantive) → real topic
    // "going" (5 chars, verb) → NOT a real topic in "it going" (state verb in social formula)
    // "happening" → verb → not substantial topic
    // Including #Verb in exclusion so "it going", "what is going on" → social
    const words = topic.trim().split(/\s+/)
    const hasSubstantialWord = words.some(w =>
      w.length >= 5 && !doc.match(w).has("(#Pronoun|#Adverb|#Preposition|#Conjunction|#Determiner|#Verb)")
    )
    if (hasSubstantialWord) return false
    // All words are short/functional → placeholder ("up", "on", "there", "it going")
    return true
  } catch {
    return topic.trim().length <= 4 && !/[a-z]{4}/i.test(topic)
  }
}

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

    // "Why" questions are always causal/explanatory — never social greetings.
    // "why do we dream", "why do we yawn" → informational even though subject is "we"
    // Research (Agent 5): "why" queries seek explanations; they have no phatic use case.
    if (/^why\b/i.test(q)) return false

    // SECOND-PERSON PATTERN: asking about "you/we" → social greeting/personal
    // "how are you", "how are we doing", "are you ok", "what do you think"
    const hasSecondPerson: boolean = doc.has("(you|your|yourself|yourselves|we|our|ourselves)")
    if (hasSecondPerson) return true

    // QUESTION-WORD + TOPIC pattern: "what is X" / "who is X" / etc.
    // Google's insight: queries are informational when X is a resolvable entity/concept.
    // We check structurally: does X parse as a content noun phrase?
    // "what is dark matter" → "dark matter" = noun phrase → factual
    // "what's up" → "up" = adverb/particle, no noun → social
    // "how is it going" → "it going" = pronoun + particle, no noun → social
    const questionVerbMatch = /^(?:what|who|where|when|why|how)\s*(?:'?s|is|are|was|were|does|do|did|can|could|will|would|should|has|have)\s*(.*)/i.exec(q)
    if (questionVerbMatch) {
      const topic = questionVerbMatch[1].trim()
      // Use NLP to check if topic is a real content noun phrase (not a placeholder)
      if (isPlaceholderTopic(topic)) return true  // social: "what's up", "how's it going"
      return false  // factual: "what is dark matter", "what is supreme"
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
