import { TEMPORAL_TERMS } from "../lexicons"
import { MatchResult } from "./index"

// A 4-digit year >= 2024 (including future years)
const RECENT_YEAR_PATTERN = /\b(202[4-9]|20[3-9]\d|2[1-9]\d{2})\b/

/**
 * Recent news matcher.
 * Triggers on temporal terms or a year >= 2024 in the residual.
 */
export function matchNewsRecent(
  residual: string,
  normalized: string
): MatchResult | null {
  const haystack = normalized.toLowerCase()

  // Check temporal terms
  for (const term of TEMPORAL_TERMS) {
    if (haystack.includes(term.toLowerCase())) {
      return {
        intent: "news_recent",
        confidence: 0.85,
        slots: { query: residual, trigger: term },
        consumed: true,
      }
    }
  }

  // Check for a recent year (>= 2024)
  const yearMatch = RECENT_YEAR_PATTERN.exec(haystack)
  if (yearMatch) {
    return {
      intent: "news_recent",
      confidence: 0.8,
      slots: { query: residual, trigger: yearMatch[0] },
      consumed: true,
    }
  }

  return null
}
