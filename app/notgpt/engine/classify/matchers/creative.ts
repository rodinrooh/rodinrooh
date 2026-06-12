import { CREATIVE_VERBS, CREATIVE_NOUNS } from "../lexicons"
import { MatchResult } from "./index"

// Build a sorted regex from creative nouns (longest first to avoid partial matches)
const NOUN_PATTERN = new RegExp(
  `\\b(${[...CREATIVE_NOUNS].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
  "i"
)

// Build a sorted regex from creative verbs (longest first)
const VERB_PATTERN = new RegExp(
  `^(${[...CREATIVE_VERBS].sort((a, b) => b.length - a.length).map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\s+`,
  "i"
)

// Joke patterns
const JOKE_PATTERNS: RegExp[] = [
  /\btell\s+me\s+a\s+joke\b/i,
  /\btell\s+(?:me\s+)?a\s+(?:funny\s+)?joke\b/i,
  /\bgive\s+me\s+a\s+joke\b/i,
  /\bsay\s+something\s+funny\b/i,
  /\bmake\s+me\s+laugh\b/i,
  /\bdo\s+you\s+know\s+(?:any\s+)?jokes?\b/i,
  /^(?:joke|a\s+joke|give\s+me\s+a\s+joke)$/i,
]

/**
 * Creative writing request matcher.
 * Detects: imperative verb + creative noun at head of query, or joke requests.
 */
export function matchCreative(
  residual: string,
  normalized: string
): MatchResult | null {
  // Check for joke requests first
  for (const pattern of JOKE_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        intent: "creative_request",
        confidence: 0.93,
        slots: { form: "joke", topic: "" },
        consumed: true,
      }
    }
  }

  // Check for imperative verb at head of string
  const verbMatch = VERB_PATTERN.exec(residual)
  if (verbMatch) {
    // Look for a creative noun anywhere in the string
    const nounMatch = NOUN_PATTERN.exec(residual)
    if (nounMatch) {
      const form = nounMatch[1].toLowerCase()
      // Extract topic: everything after the noun (or the full residual)
      const nounEnd = nounMatch.index + nounMatch[0].length
      const topic = residual.slice(nounEnd).replace(/^\s*(?:about|on|for|regarding)?\s*/i, "").trim()

      return {
        intent: "creative_request",
        confidence: 0.9,
        slots: {
          form,
          topic: topic || residual.slice(verbMatch[0].length).replace(nounMatch[0], "").trim(),
        },
        consumed: true,
      }
    }
  }

  // Also check normalized for "write/compose/etc a poem/story/etc"
  const verbMatchNorm = VERB_PATTERN.exec(normalized)
  if (verbMatchNorm) {
    const nounMatch = NOUN_PATTERN.exec(normalized)
    if (nounMatch) {
      const form = nounMatch[1].toLowerCase()
      const nounEnd = nounMatch.index + nounMatch[0].length
      const topic = normalized.slice(nounEnd).replace(/^\s*(?:about|on|for|regarding)?\s*/i, "").trim()

      return {
        intent: "creative_request",
        confidence: 0.9,
        slots: {
          form,
          topic: topic || normalized.slice(verbMatchNorm[0].length).replace(nounMatch[0], "").trim(),
        },
        consumed: true,
      }
    }
  }

  return null
}
