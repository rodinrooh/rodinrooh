import { MatchResult } from "./index"

// "X vs Y" pattern — handles "vs", "vs.", "versus"
const VS_PATTERN = /^(.+?)\s+vs\.?\s+(.+)$/i

// "difference between X and Y"
const DIFFERENCE_PATTERN = /^(?:what(?:'s|\s+is)?\s+the\s+)?difference\s+between\s+(.+?)\s+and\s+(.+)$/i

// "compare X and/to/with Y"
const COMPARE_PATTERN = /^compare\s+(.+?)\s+(?:and|to|with|versus|vs\.?)\s+(.+)$/i

// "who is richer/better/older X or Y" — case-insensitive, works after normalize lowercases names
const COMPARATIVE_OR_PATTERN = /\b(?:richer|poorer|taller|shorter|older|younger|smarter|faster|stronger|bigger|smaller)\b.*?(\w+(?:\s+\w+)?)\s+or\s+(\w+(?:\s+\w+)?)$/i

// "X or Y" can be comparison sometimes, but too ambiguous — skip

// "X and Y comparison"
const AND_COMPARISON_PATTERN = /^(.+?)\s+and\s+(.+?)\s+comparison$/i

/**
 * Comparison matcher.
 * Extracts entity pairs from "X vs Y", "difference between X and Y", "compare X and Y".
 *
 * Note: The main classify() function is responsible for the whole-string entity gate.
 * This matcher simply extracts the entities; the caller decides whether to use the result.
 */
export function matchComparison(
  residual: string,
  normalized: string
): MatchResult | null {
  const candidates = [normalized, residual]

  for (const candidate of candidates) {
    // Try each pattern
    const patterns: Array<RegExp> = [
      VS_PATTERN,
      DIFFERENCE_PATTERN,
      COMPARE_PATTERN,
      AND_COMPARISON_PATTERN,
      COMPARATIVE_OR_PATTERN,
    ]

    for (const pattern of patterns) {
      const match = pattern.exec(candidate)
      if (match) {
        const entityA = match[1].trim().replace(/[?.!]+$/, "").trim()
        const entityB = match[2].trim().replace(/[?.!]+$/, "").trim()

        if (entityA.length > 0 && entityB.length > 0) {
          return {
            intent: "comparison",
            confidence: 0.88,
            slots: { entityA, entityB },
            consumed: true,
          }
        }
      }
    }
  }

  return null
}
