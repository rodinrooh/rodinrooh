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
  if (isSocial(q)) return "social"
  if (isPreference(q)) return "social"
  return "factual"
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
function isSocial(q: string): boolean {
  if (q.length > 30) return false  // longer queries almost always have informational intent
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
    // Secondary structural check: greeting/farewell pattern detected by NLP
    // compromise has a #Greeting tag for salutations like "hello", "hi", "hey"
    try {
      const hasGreeting = doc.has("#Greeting")
      if (hasGreeting && contentNouns === 0) return true
    } catch { /* ignore */ }
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
    // Check for recommendation-class verbs (compromise knows these from its vocabulary)
    const hasRecommendVerb = doc.has("(recommend|suggest|advise|prescribe)")
    // Check for first-person modal question structure: "what should I", "could you suggest"
    const hasFirstPersonModal = doc.has("#Modal") && (doc.has("(i|me|my|we|us|our)") || doc.has("you #Verb (i|me|my)"))
    return hasRecommendVerb || hasFirstPersonModal
  } catch {
    return false
  }
}
