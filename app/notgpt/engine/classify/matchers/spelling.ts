import { MatchResult } from "./index"

const SPELLING_PATTERNS: Array<[RegExp, number]> = [
  // "how do you spell X" → group 1
  [/^how\s+(?:do\s+you\s+|does\s+one\s+)?spell\s+(.+)$/i, 1],
  // "how is X spelled" → group 1
  [/^how\s+is\s+(.+?)\s+spelled\b/i, 1],
  // "is X spelled correctly" → group 1
  [/^is\s+(.+?)\s+spelled\s+correctly\b/i, 1],
  // "correct spelling of X" → group 1
  [/^(?:what\s+is\s+the\s+)?correct\s+spelling\s+of\s+(.+)$/i, 1],
  // "spelling of X" → group 1
  [/^spelling\s+of\s+(.+)$/i, 1],
  // "how to spell X" → group 1
  [/^how\s+to\s+spell\s+(.+)$/i, 1],
  // "spell X for me" → group 1
  [/^spell\s+(.+?)(?:\s+for\s+me)?\s*$/i, 1],
  // "what is the spelling of X" → group 1
  [/^what\s+is\s+the\s+spelling\s+of\s+(.+)$/i, 1],
  // "how do you spell X correctly" → group 1 (trailing "correctly" stripped)
  [/^how\s+(?:do\s+you\s+)?spell\s+(.+?)\s+correctly\s*$/i, 1],
  // "is it [word1] or [word2]" for commonly confused spellings
  [/^is\s+it\s+(.+?)\s+or\s+.+\s+(?:or\s+.+\s+)?(?:correct(?:ly)?|right)?\s*$/i, 1],
]

/**
 * Spelling query matcher.
 * Detects requests to check or provide the correct spelling of a word.
 */
export function matchSpelling(
  residual: string,
  normalized: string
): MatchResult | null {
  for (const [pattern, group] of SPELLING_PATTERNS) {
    const match = pattern.exec(normalized) || pattern.exec(residual)
    if (match) {
      const word = match[group].trim().replace(/[?.!]+$/, "").trim()
      if (word.length > 0) {
        return {
          intent: "spelling",
          confidence: 0.93,
          slots: { word },
          consumed: true,
        }
      }
    }
  }

  return null
}
