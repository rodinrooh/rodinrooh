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

// Hypothetical/counterfactual patterns — route to unanswerable_prediction
const HYPOTHETICAL_PATTERNS = [
  /\bwhat\s+(?:would|will|could|might)\s+happen\s+if\b/i,
  /\bwhat\s+if\s+(?:the|a|an)?\s*\w/i,
  /\bif\s+(?:the\s+)?\w+\s+(?:disappeared|stopped|didn't exist|ceased|exploded|vanished)/i,
  /\bcould\s+(?:humans?|people|we|you)\s+(?:ever|possibly|theoretically)\b/i,
]

/**
 * Opinion / subjective query matcher.
 * Also catches hypothetical/counterfactual questions that no reference source can answer.
 */
export function matchOpinion(
  residual: string,
  normalized: string
): MatchResult | null {
  const haystack = normalized.toLowerCase()

  // Hypotheticals — sub-typed as prediction so the pipeline uses UNANSWERABLE_PREDICTION copy
  for (const pattern of HYPOTHETICAL_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        intent: "opinion",
        confidence: 0.9,
        slots: { topic: residual, trigger: "hypothetical", subtype: "prediction" },
        consumed: true,
      }
    }
  }

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
