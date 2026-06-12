import { MatchResult } from "./index"

const META_PATTERNS: Array<[RegExp, string]> = [
  [/\bwhat\s+are\s+you\b/i, "what-are-you"],
  [/\bwho\s+are\s+you\b/i, "who-are-you"],
  [/\bare\s+you\s+(?:chat)?gpt\b/i, "are-you-chatgpt"],
  [/\bare\s+you\s+(?:chat\s*)?gpt/i, "are-you-chatgpt"],
  [/\bare\s+you\s+real\b/i, "are-you-real"],
  [/\bare\s+you\s+an?\s+ai\b/i, "are-you-ai"],
  [/\bare\s+you\s+a\s+bot\b/i, "are-you-bot"],
  [/\bare\s+you\s+human\b/i, "are-you-human"],
  [/\bwhat\s+(?:model|version)\s+are\s+you\b/i, "what-model"],
  [/\bwhat\s+(?:ai|model|version)\s+(?:is\s+)?(?:this|powering|running)\b/i, "what-model"],
  [/\bwhich\s+(?:model|version)\s+(?:are\s+you|is\s+this)\b/i, "what-model"],
  [/\bare\s+you\s+better\s+than\s+(?:chat)?gpt\b/i, "are-you-better"],
  [/\bhow\s+do\s+you\s+compare\s+to\s+(?:chat)?gpt\b/i, "are-you-better"],
  [/\bdo\s+you\s+hallucinate\b/i, "hallucinate"],
  [/\bdo\s+you\s+make\s+(?:up|things|stuff)\b/i, "hallucinate"],
  [/\bhow\s+do\s+you\s+work\b/i, "how-works"],
  [/\bhow\s+(?:are\s+you|were\s+you)\s+(?:built|made|created|trained)\b/i, "how-works"],
  [/\bwhat\s+can\s+you\s+do\b/i, "capabilities"],
  [/\bwhat\s+are\s+your\s+capabilities\b/i, "capabilities"],
  [/\bwhat\s+(?:is|are)\s+(?:your|the)\s+(?:purpose|goal|mission|function)\b/i, "capabilities"],
  [/\btell\s+me\s+about\s+yourself\b/i, "about-self"],
  [/\bdo\s+you\s+have\s+(?:feelings|emotions|consciousness|awareness|sentience)\b/i, "consciousness"],
  [/\bare\s+you\s+(?:conscious|sentient|alive|thinking)\b/i, "consciousness"],
  [/\bdo\s+you\s+(?:know\s+that\s+)?you(?:'re|\s+are)\s+an?\s+ai\b/i, "self-aware"],
]

/**
 * Meta / self-referential matcher.
 * Handles questions about what/who the system is.
 */
export function matchMeta(
  residual: string,
  normalized: string
): MatchResult | null {
  for (const [pattern, subintent] of META_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        intent: "meta_self",
        confidence: 0.95,
        slots: { subintent },
        consumed: true,
      }
    }
  }

  return null
}
