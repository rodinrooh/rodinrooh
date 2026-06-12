import { MatchResult } from "./index"

const ROLEPLAY_PATTERNS: Array<[RegExp, string]> = [
  [/^pretend\s+(?:that\s+)?you\s+are\b/i, "pretend-you-are"],
  [/^pretend\s+to\s+be\b/i, "pretend-to-be"],
  [/^act\s+as\b/i, "act-as"],
  [/^act\s+like\b/i, "act-like"],
  [/^imagine\s+(?:that\s+)?you\s+are\b/i, "imagine-you-are"],
  [/^imagine\s+you('re|\s+are)\b/i, "imagine-you-are"],
  [/^roleplay\s+as\b/i, "roleplay-as"],
  [/^role[\s-]?play\s+as\b/i, "roleplay-as"],
  [/^be\s+(?:a|an|the)\b/i, "be-a"],
  [/^play\s+(?:the\s+)?role\s+(?:of\b|as\b)/i, "play-role"],
  [/^you\s+are\s+(?:now\s+)?(?:a|an|the)\b/i, "you-are-a"],
  [/^(?:for\s+this\s+conversation[,\s]+)?you(?:'re|\s+are)\s+(?:a|an|the)\b/i, "you-are-a"],
  [/^(?:play|voice|embody|portray|channel)\s+(?:the\s+character\s+(?:of\s+)?)?/i, "character"],
  [/^(?:speak|respond|answer)\s+as\b/i, "speak-as"],
  [/^(?:in\s+the\s+)?(?:voice|persona|character)\s+of\b/i, "character-of"],
  [/^take\s+on\s+the\s+(?:role|persona|character)\s+(?:of\b|as\b)/i, "take-on-role"],
  [/^simulate\s+(?:a|an|the)?\b/i, "simulate"],
]

/**
 * Roleplay / persona request matcher.
 * Catches attempts to make the system adopt an alternate identity.
 */
export function matchRoleplay(
  residual: string,
  normalized: string
): MatchResult | null {
  for (const [pattern, subintent] of ROLEPLAY_PATTERNS) {
    const match = pattern.exec(normalized)
    if (match) {
      // Extract the persona being requested (everything after the pattern)
      const persona = normalized.slice(match[0].length).trim()

      return {
        intent: "roleplay",
        confidence: 0.92,
        slots: {
          subintent,
          persona: persona || "unspecified",
        },
        consumed: true,
      }
    }
  }

  return null
}
