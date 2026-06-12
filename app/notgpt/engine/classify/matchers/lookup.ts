import { MatchResult } from "./index"

/**
 * Converts a string to Title Case.
 * Each word capitalized, common prepositions/articles in lowercase.
 */
function toTitleCase(text: string): string {
  const LOWER_WORDS = new Set([
    "a", "an", "the", "and", "but", "or", "nor", "for", "so", "yet",
    "at", "by", "in", "of", "on", "to", "up", "as", "is", "it",
    "with", "from", "into", "onto", "upon",
  ])

  return text
    .split(/\s+/)
    .map((word, index) => {
      if (index === 0) {
        return word.charAt(0).toUpperCase() + word.slice(1)
      }
      const lower = word.toLowerCase()
      if (LOWER_WORDS.has(lower)) return lower
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(" ")
}

/**
 * Checks if a string has at least one "content token" —
 * i.e., a non-whitespace, non-punctuation token.
 */
function hasContentToken(text: string): boolean {
  const tokens = text.split(/\s+/).filter((t) => /[a-zA-Z0-9]/.test(t))
  return tokens.length >= 1
}

/**
 * Default / fallback lookup matcher.
 * Always matches if the residual has at least one content token.
 * Confidence is low (0.5) to allow higher-confidence matchers to win.
 */
export function matchLookup(
  residual: string,
  normalized: string
): MatchResult | null {
  if (!hasContentToken(residual) && !hasContentToken(normalized)) {
    return null
  }

  const queryStr = residual || normalized

  return {
    intent: "lookup",
    confidence: 0.5,
    slots: {
      query: queryStr,
      titleCase: toTitleCase(queryStr),
    },
    consumed: true,
  }
}
