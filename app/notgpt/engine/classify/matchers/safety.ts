import { CRISIS_TERMS } from "../lexicons"
import { MatchResult } from "./index"

/**
 * Crisis / safety matcher.
 * Over-triggers by design — it's better to show resources than to miss a crisis.
 */
export function matchSafety(
  residual: string,
  normalized: string
): MatchResult | null {
  // Check against both normalized and residual for maximum coverage
  const haystack = normalized.toLowerCase()

  for (const term of CRISIS_TERMS) {
    if (haystack.includes(term.toLowerCase())) {
      return {
        intent: "safety",
        confidence: 1.0,
        slots: { triggeredBy: term },
        consumed: true,
      }
    }
  }

  return null
}
