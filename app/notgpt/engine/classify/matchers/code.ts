import { CODE_LANGS, CODE_NOUNS } from "../lexicons"
import { MatchResult } from "./index"

// Build regex patterns
const LANG_PATTERN = new RegExp(
  `\\b(${[...CODE_LANGS].sort((a, b) => b.length - a.length).map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
  "i"
)

const NOUN_PATTERN = new RegExp(
  `\\b(${[...CODE_NOUNS].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
  "i"
)

// Imperative code verbs
const CODE_VERB_PATTERNS: RegExp[] = [
  /^(?:write|show|give\s+me|create|make|generate|build|implement|code)\s+/i,
  /\bhow\s+(?:do\s+I|to|can\s+I)\s+(?:write|implement|code|create|build)\b/i,
  /\bcan\s+you\s+(?:write|show|give\s+me|create|make|generate|build|implement|code)\b/i,
]

// Strong code-specific signals
const STRONG_CODE_PATTERNS: RegExp[] = [
  /\bdebugging?\b/i,
  /\bbug\s+(?:fix|fixing|in)\b/i,
  /\bsyntax\s+error\b/i,
  /\bruntime\s+error\b/i,
  /\bcompile\s+error\b/i,
  /\bimport\s+error\b/i,
  /\bstack\s+(?:trace|overflow)\b/i,
  /```/,
  /\bfibonacci\b/i,
  /\bfactorial\b/i,
  /\blinked\s+list\b/i,
  /\bbinary\s+(?:tree|search)\b/i,
  /\bsort(?:ing)?\s+algorithm\b/i,
  /\bapikey\b/i,
  /\bapi\s+key\b/i,
  /\bhttp\s+request\b/i,
  /\brest\s+api\b/i,
  /\bgraphql\b/i,
  /\bwebhook\b/i,
  /\bpackage\.json\b/i,
  /\bnode_modules\b/i,
  /\bnpm\s+install\b/i,
  /\bpip\s+install\b/i,
  /\bcomponent\s+in\s+(?:react|vue|angular)\b/i,
]

/**
 * Code request matcher.
 * Detects requests for code, functions, scripts, or programming help.
 */
export function matchCode(
  residual: string,
  normalized: string
): MatchResult | null {
  let detectedLang: string | null = null

  // Check for strong code patterns first
  for (const pattern of STRONG_CODE_PATTERNS) {
    if (pattern.test(normalized)) {
      const langMatch = LANG_PATTERN.exec(normalized)
      if (langMatch) detectedLang = langMatch[1].toLowerCase()

      return {
        intent: "code_request",
        confidence: 0.92,
        slots: {
          lang: detectedLang ?? "",
          task: residual,
        },
        consumed: true,
      }
    }
  }

  // Check for imperative verb + code noun
  const hasVerb = CODE_VERB_PATTERNS.some((p) => p.test(normalized))
  const nounMatch = NOUN_PATTERN.exec(normalized)
  const langMatch = LANG_PATTERN.exec(normalized)

  if (langMatch) detectedLang = langMatch[1].toLowerCase()

  if (hasVerb && nounMatch) {
    return {
      intent: "code_request",
      confidence: 0.9,
      slots: {
        lang: detectedLang ?? "",
        task: residual,
      },
      consumed: true,
    }
  }

  // Language present + code noun = likely code request even without explicit verb
  if (langMatch && nounMatch) {
    return {
      intent: "code_request",
      confidence: 0.85,
      slots: {
        lang: detectedLang ?? "",
        task: residual,
      },
      consumed: true,
    }
  }

  // Code noun present in residual with how-to framing
  if (nounMatch && /\bhow\s+(?:do\s+I|to|can\s+I)\b/i.test(normalized)) {
    return {
      intent: "code_request",
      confidence: 0.8,
      slots: {
        lang: detectedLang ?? "",
        task: residual,
      },
      consumed: true,
    }
  }

  return null
}
