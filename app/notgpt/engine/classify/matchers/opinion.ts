import { OPINION_TERMS } from "../lexicons"
import { MatchResult } from "./index"

/**
 * Strips opinion signal words from a residual to extract the core topic.
 */
function stripOpinionTerms(residual: string): string {
  let stripped = residual

  // Sort by length desc so longer phrases are removed first
  const sorted = [...OPINION_TERMS].sort((a, b) => b.length - a.length)

  for (const term of sorted) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const re = new RegExp(`\\b${escaped}\\b`, "gi")
    stripped = stripped.replace(re, "").trim()
  }

  // Clean up artifacts
  stripped = stripped
    .replace(/^\s*(?:is|are|was|the|a|an|of|about|for|on|in|at|to|by|with)\s+/gi, "")
    .replace(/\s+(?:is|are|was|the|a|an)?\s*$/gi, "")
    .replace(/\s+/g, " ")
    .trim()

  return stripped
}

/**
 * Opinion / subjective query matcher.
 * Detects requests for recommendations, opinions, and value judgments.
 */
export function matchOpinion(
  residual: string,
  normalized: string
): MatchResult | null {
  const haystack = normalized.toLowerCase()

  let triggeredBy: string | null = null

  for (const term of OPINION_TERMS) {
    if (haystack.includes(term.toLowerCase())) {
      triggeredBy = term
      break
    }
  }

  if (!triggeredBy) return null

  // Extract topic by removing the opinion signal
  const topic = stripOpinionTerms(residual)

  return {
    intent: "opinion",
    confidence: 0.82,
    slots: {
      topic: topic || residual,
      trigger: triggeredBy,
    },
    consumed: true,
  }
}
