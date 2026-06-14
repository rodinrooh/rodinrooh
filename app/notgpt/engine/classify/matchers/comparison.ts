import { MatchResult } from "./index"

// "X vs Y" pattern — handles "vs", "vs.", "versus"
const VS_PATTERN = /^(.+?)\s+vs\.?\s+(.+)$/i

// "difference between X and Y"
const DIFFERENCE_PATTERN = /^(?:what(?:'s|\s+is)?\s+the\s+)?difference\s+between\s+(.+?)\s+and\s+(.+)$/i

// "compare X and/to/with Y"
const COMPARE_PATTERN = /^compare\s+(.+?)\s+(?:and|to|with|versus|vs\.?)\s+(.+)$/i

// "who is richer/better/older X or Y" — case-insensitive, works after normalize lowercases names
const COMPARATIVE_OR_PATTERN = /\b(?:richer|poorer|taller|shorter|older|younger|smarter|faster|stronger|bigger|smaller)\b.*?(\w+(?:\s+\w+)?)\s+or\s+(\w+(?:\s+\w+)?)$/i

// "is X bigger/older than Y" — comparison framed as a question, not "X vs Y"
// "is the great pyramid older than stonehenge" → compare pyramid vs stonehenge
// "is neptune farther from the sun than uranus" → handle "farther FROM X than Y" with optional reference frame
const COMPARATIVE_THAN_PATTERN = /^is\s+(?:the\s+|a\s+|an\s+)?(.+?)\s+(?:bigger|smaller|larger|taller|shorter|older|younger|longer|wider|deeper|heavier|lighter|faster|slower|higher|lower|newer|hotter|colder|closer|farther|further|brighter|dimmer|stronger|weaker|denser|richer|poorer|more\s+\w+|less\s+\w+)(?:\s+(?:from|to|of|away|above|below)\b[^?]*?)?\s+than\s+(?:the\s+|a\s+|an\s+)?(.+?)(?:\?)?$/i

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
      COMPARATIVE_THAN_PATTERN,
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
