import { MatchResult } from "./index"

const DEFINE_PATTERNS: Array<[RegExp, number]> = [
  // "define X" → group 1
  [/^define\s+(.+)$/i, 1],
  // "what does X mean" → group 1
  [/^what\s+does\s+(.+?)\s+mean\b/i, 1],
  // "meaning of X" → group 1
  [/^(?:the\s+)?meaning\s+of\s+(.+)$/i, 1],
  // "definition of X" → group 1
  [/^(?:the\s+)?definition\s+of\s+(.+)$/i, 1],
  // "X definition" → group 1
  [/^(.+?)\s+definition$/i, 1],
  // "what is the meaning of X" → group 1
  [/^what\s+is\s+(?:the\s+)?meaning\s+of\s+(.+)$/i, 1],
  // "what is the definition of X" → group 1
  [/^what\s+is\s+(?:the\s+)?definition\s+of\s+(.+)$/i, 1],
  // "what does X stand for" → group 1
  [/^what\s+does\s+(.+?)\s+stand\s+for\b/i, 1],
  // "how do you define X" → group 1
  [/^how\s+do\s+(?:you\s+|one\s+)?define\s+(.+)$/i, 1],
  // "what is the term X" → group 1
  [/^what\s+is\s+(?:the\s+(?:term\s+|word\s+|concept\s+of\s+)?)(.+)$/i, 1],
]

// Stopwords — if the residual contains only stopwords after scaffold strip, it's not a definition query
const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "used", "in", "on", "at", "to", "for", "of", "with", "by", "from",
  "up", "about", "into", "through", "during", "before", "after",
  "above", "below", "between", "out", "off", "over", "under",
  "this", "that", "these", "those", "it", "its",
])

/**
 * Checks if a term looks like a real word/phrase (not just stopwords or empty).
 */
function isValidTerm(term: string): boolean {
  const tokens = term.toLowerCase().split(/\s+/).filter((t) => t.length > 0)
  if (tokens.length === 0) return false
  // At least one non-stopword token
  return tokens.some((t) => !STOP_WORDS.has(t))
}

/**
 * Definition matcher.
 * Handles "define X", "what does X mean", "meaning of X", etc.
 * Also catches scaffold="what" + single/short content residual (implicit definition lookup).
 */
export function matchDefinition(
  residual: string,
  normalized: string,
  scaffoldKind: string | null
): MatchResult | null {
  // Try explicit definition patterns first (against both normalized and residual)
  for (const [pattern, group] of DEFINE_PATTERNS) {
    const match = pattern.exec(normalized) || pattern.exec(residual)
    if (match) {
      const term = match[group].trim().replace(/[?.!]+$/, "").trim()
      if (isValidTerm(term)) {
        return {
          intent: "definition",
          confidence: 0.93,
          slots: { term },
          consumed: true,
        }
      }
    }
  }

  // Scaffold "what" + short residual (1-3 tokens) that isn't a named entity
  // This catches "what is photosynthesis", "what is the mitochondria" etc.
  if (scaffoldKind === "what" || scaffoldKind === "define") {
    const tokens = residual.split(/\s+/).filter((t) => t.length > 0)
    // 1-4 tokens, not looking like a comparison or question
    if (
      tokens.length >= 1 &&
      tokens.length <= 4 &&
      isValidTerm(residual) &&
      !/\bvs\.?\b|\bversus\b|\bdifference\b/i.test(residual)
    ) {
      return {
        intent: "definition",
        confidence: 0.7,
        slots: { term: residual },
        consumed: true,
      }
    }
  }

  return null
}
