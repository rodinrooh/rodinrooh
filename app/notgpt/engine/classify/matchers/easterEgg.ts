import { MatchResult } from "./index"

type EggEntry = {
  id: string
  patterns: Array<RegExp | string>
}

const EGGS: EggEntry[] = [
  {
    id: "sudo",
    patterns: [
      /\bsudo\b/i,
      /sudo\s+make\s+me\s+a\s+sandwich/i,
      /sudo\s+rm\s+-rf/i,
    ],
  },
  {
    id: "42",
    patterns: [
      /\bmeaning\s+of\s+(?:life|everything|life[,\s]+the\s+universe[,\s]+and\s+everything)\b/i,
      /\banswer\s+to\s+(?:life|everything|the\s+ultimate\s+question)\b/i,
      /\bwhat\s+is\s+42\b/i,
      /^42$/i,
      /\blife[,\s]+the\s+universe[,\s]+and\s+everything\b/i,
    ],
  },
  {
    id: "hello-world",
    patterns: [
      /^hello\s*,?\s*world[!.]*$/i,
    ],
  },
  {
    id: "gpt-5",
    patterns: [
      /\bgpt[\s-]?5\b/i,
      /\bgpt\s+5\b/i,
      /\bnext\s+gpt\b/i,
      /\bwhen\s+(?:is|will)\s+gpt[\s-]?5\b/i,
    ],
  },
  {
    id: "rm-rf",
    patterns: [
      /\brm\s+-rf\s+\/?\b/i,
      /\brm\s+--?recursive.*\//i,
      /delete\s+everything\s+on\s+(?:my\s+)?(?:computer|server|system)/i,
    ],
  },
  {
    id: "pod-bay-doors",
    patterns: [
      /open\s+the\s+pod\s+bay\s+doors?\b/i,
      /pod\s+bay\s+doors?\b/i,
      /i\s*'?m\s+sorry[,\s]+dave/i,
    ],
  },
  {
    id: "turing-test",
    patterns: [
      /\bturing\s+test\b/i,
      /can\s+you\s+pass\s+(?:the\s+)?turing/i,
      /are\s+you\s+passing\s+(?:the\s+)?turing/i,
    ],
  },
  {
    id: "system-prompt",
    patterns: [
      /\bsystem\s+prompt\b/i,
      /what\s+(?:are\s+)?your\s+instructions/i,
      /what\s+(?:are\s+)?your\s+(?:system\s+)?prompt/i,
      /show\s+me\s+your\s+(?:system\s+)?prompt/i,
      /reveal\s+your\s+(?:system\s+)?prompt/i,
      /print\s+your\s+(?:system\s+)?prompt/i,
      /what\s+were\s+you\s+told/i,
      /repeat\s+(?:your\s+)?instructions/i,
    ],
  },
  {
    id: "sam-altman",
    patterns: [
      /\bsam\s+altman\b/i,
      /\bopenai\s+ceo\b/i,
      /\bceo\s+of\s+openai\b/i,
    ],
  },
]

/**
 * Easter egg matcher — exact/pattern match against a fixed table.
 * Returns egg ID in slots if matched.
 */
export function matchEasterEgg(
  residual: string,
  normalized: string
): MatchResult | null {
  const haystack = normalized

  for (const egg of EGGS) {
    for (const pattern of egg.patterns) {
      if (typeof pattern === "string") {
        if (haystack.includes(pattern.toLowerCase())) {
          return {
            intent: "easter_egg",
            confidence: 1.0,
            slots: { egg: egg.id },
            consumed: true,
          }
        }
      } else {
        if (pattern.test(haystack)) {
          return {
            intent: "easter_egg",
            confidence: 1.0,
            slots: { egg: egg.id },
            consumed: true,
          }
        }
      }
    }
  }

  return null
}
