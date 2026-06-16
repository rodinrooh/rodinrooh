/**
 * Minimal query classification.
 * Only distinguishes the handful of intents that have non-Wikipedia answers.
 * Everything else — why/how/what/who/when/where and even weather/currency — goes
 * through the factual Wikipedia retrieval pipeline.
 */

export type Intent =
  | "social"    // greetings, reactions — no lookup
  | "math"      // arithmetic / unit conversion
  | "factual"   // default — Wikipedia passage retrieval

/** Social signals: standalone short inputs with no factual content. */
const SOCIAL_RE = /^(?:hi+|hey+|hello|howdy|sup|yo+|bye|cya|goodbye|thanks?|thx|ty|ok+|okay|k|lol|lmao|omg|wtf|bruh|dude|cool|nice|great|awesome|sure|fine|yeah|nah|nope|yep|hmm|hm+|uh+|oh+|ah+|wow|whoa|damn|geez|yikes|oops)\s*[!?.]?\s*$/i

const MATH_RE = /^[\d\s+\-*/^().%,=]+$|what\s+is\s+[\d].*[\d]|^\d+\s*[+\-*/]\s*\d+|how\s+much\s+is\s+\d|convert\s+\d/i

// Preference/opinion requests that have no factual Wikipedia answer.
// Detected structurally: they start with "recommend/suggest/tell me what to" or
// ask "what should I" — personal advice verbs that Wikipedia can't satisfy.
const PREFERENCE_RE = /^(?:recommend|suggest|tell\s+me\s+(?:what\s+to|a\s+good)|what\s+should\s+i\s+(?:do|eat|have|watch|read|buy|get)|can\s+you\s+recommend|give\s+me\s+a\s+recommendation)/i

export function classify(query: string): Intent {
  const q = query.trim()

  if (q.length < 20 && SOCIAL_RE.test(q)) return "social"
  if (MATH_RE.test(q)) return "math"
  if (PREFERENCE_RE.test(q)) return "social"
  return "factual"
}
