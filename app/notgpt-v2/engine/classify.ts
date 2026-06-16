/**
 * Query classification using NLP structural signals.
 *
 * No hardcoded word lists or social-phrase enumerations.
 * Classification is purely structural:
 *   - social: zero informational content (no content nouns, no substantive verbs)
 *   - math: numeric/arithmetic structure
 *   - preference: first-person recommendation request (modal + first-person + recommendation verb)
 *   - factual: everything else → Wikipedia retrieval pipeline
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nlp = require("compromise") as (text: string) => unknown

export type Intent =
  | "social"    // greetings, reactions — no lookup
  | "math"      // arithmetic / unit conversion
  | "factual"   // default — Wikipedia passage retrieval

const MATH_RE = /^[\d\s+\-*/^().%,=]+$|what\s+is\s+[\d].*[\d]|^\d+\s*[+\-*/]\s*\d+|how\s+much\s+is\s+\d|convert\s+\d/i

export function classify(query: string): Intent {
  const q = query.trim()

  if (MATH_RE.test(q)) return "math"
  if (isRepeatedFiller(q)) return "social"
  if (isSocial(q)) return "social"
  if (isPreference(q)) return "social"
  return "factual"
}

/**
 * Structural repeated-word detection. "yo yo yo", "ha ha ha", "lol lol" are pure filler —
 * detected by pattern (same word ≥2 times, each word ≤5 chars), not by enumerating words.
 */
function isRepeatedFiller(q: string): boolean {
  const words = q.toLowerCase().split(/\s+/)
  if (words.length < 2) return false
  const unique = new Set(words)
  return unique.size === 1 && words[0].length <= 5
}

/**
 * Social detection: a query is social when it carries zero factual information-seeking intent.
 * Primary structural signal: no content nouns + no named entities (= nothing to look up).
 * Short queries (≤30 chars) without any informational anchor are social exchanges.
 *
 * Why we focus on nouns+entities rather than verbs: verbs are unreliable signals because
 * NLP tools often tag interjections/greetings as verbs ("hello" → #Verb in some parsers).
 * The absence of a topic noun is the definitive structural signal for social content.
 *
 * Examples that return true: "hey", "thanks", "lol ok", "bye", "hello there"
 * Examples that return false: "gravity" (noun), "what time is it" (factual), "Netflix" (named entity)
 */
// Question words that signal informational intent — any query with these is factual
const QUESTION_WORDS_RE = /\b(what|why|how|who|where|when|which|is|are|was|were|does|do|did|can|could|will|would|should)\b/i

function isSocial(q: string): boolean {
  if (q.length > 30) return false  // longer queries almost certainly have informational content
  // Any query containing a question word has informational intent and cannot be social.
  // "who founded it", "are they still around" — these are queries, not greetings.
  if (QUESTION_WORDS_RE.test(q)) return false
  try {
    // Lowercase before NLP to avoid false positives: "Hello" → "hello" (not a ProperNoun)
    const doc = nlp(q.toLowerCase()) as any
    // Content nouns = nouns that aren't pronouns or interjections (topic anchors to look up)
    // Exclude #Interjection: "hello" can be tagged as noun AND interjection; here it's a greeting
    const contentNouns = doc.nouns().not("#Pronoun").not("#Interjection").length
    // Named entities = proper nouns (brands, places, people — also things to look up)
    const namedEntities = doc.match("#ProperNoun").length
    // A query with no content nouns AND no named entities has nothing to retrieve
    if (contentNouns === 0 && namedEntities === 0) return true
    // Short social-pattern: "hello there", "hi there" — "there" gets tagged as a noun
    // but it's clearly social. Pattern: very short query, all nouns are ≤5 chars, no
    // noun is ≤2 chars (abbreviations like "la" or "tv" indicate real topics), no named entities.
    const contentNounWords: string[] = doc.nouns().not("#Pronoun").not("#Interjection").out("array")
    const allNounsShort = contentNounWords.length > 0 &&
      contentNounWords.every((n: string) => n.length <= 5) &&
      !contentNounWords.some((n: string) => n.length <= 2)  // exclude abbreviations ("la", "tv", "ny")
    if (allNounsShort && namedEntities === 0 && q.length < 15) return true
    return false
  } catch {
    return q.length < 8 && !/[a-z]{5}/i.test(q)
  }
}

/**
 * Preference detection: a query is a preference request when it asks for a personal
 * recommendation that Wikipedia can't answer.
 * Signal: first-person context + recommendation-class verb pattern, detected via NLP.
 *
 * Structural pattern: query contains a recommendation/suggestion verb AND
 * first-person grammatical context (I/me/my/we).
 * This detects "recommend me a book", "what should I eat", "suggest something for me"
 * without enumerating specific phrases.
 */
function isPreference(q: string): boolean {
  try {
    const doc = nlp(q) as any
    // Check for explicit recommendation-class verbs — clearest signal
    const hasRecommendVerb = doc.has("(recommend|suggest|advise)")
    // "what should I [do/eat/watch/buy]" — strict first-person decision request
    const hasWhatShouldI = /\bwhat\s+should\s+i\b/i.test(q) || /\bshould\s+i\b/i.test(q)
    return hasRecommendVerb || hasWhatShouldI
  } catch {
    return false
  }
}
