import { CONTRACTIONS, SCAFFOLDS } from "./lexicons"

export type NormalizeResult = {
  normalized: string       // fully cleaned text, contractions expanded, apostrophes ASCII
  scaffoldKind: string | null
  residual: string         // after scaffold strip
  wantsSimple: boolean     // "eli5" / "explain like i'm five" prefix detected and stripped
}

// Apostrophe-like Unicode characters that autocorrect substitutes for ASCII apostrophe.
// NFKC does NOT normalize these — we must handle them explicitly.
const CURLY_APOSTROPHES = /[’‘ʼ`´ʹ]/g

// ELI5 prefixes: strip from query and mark wantsSimple = true.
// These must be at the start of the query (after slang stripping).
const ELI5_PREFIX = /^(?:eli5|explain\s+like\s+(?:i(?:'m|\s+am)\s+five|a\s+five\s+year\s+old|i(?:'m|\s+am)\s+(?:a\s+)?(?:kid|child|5)|five)|explain\s+simply|simplify)\s+/i

// Number words to digits — applied only inside the math context (see math.ts),
// but also stripped from scaffold residuals so "two" doesn't end up as a search term.
// Map covers 0-20 + common large numbers.
export const NUMBER_WORDS: Array<[RegExp, string]> = [
  [/\bzero\b/gi, "0"],
  [/\bone\b/gi, "1"],
  [/\btwo\b/gi, "2"],
  [/\bthree\b/gi, "3"],
  [/\bfour\b/gi, "4"],
  [/\bfive\b/gi, "5"],
  [/\bsix\b/gi, "6"],
  [/\bseven\b/gi, "7"],
  [/\beight\b/gi, "8"],
  [/\bnine\b/gi, "9"],
  [/\bten\b/gi, "10"],
  [/\beleven\b/gi, "11"],
  [/\btwelve\b/gi, "12"],
  [/\bthirteen\b/gi, "13"],
  [/\bfourteen\b/gi, "14"],
  [/\bfifteen\b/gi, "15"],
  [/\bsixteen\b/gi, "16"],
  [/\bseventeen\b/gi, "17"],
  [/\beighteen\b/gi, "18"],
  [/\bnineteen\b/gi, "19"],
  [/\btwenty\b/gi, "20"],
  [/\bhundred\b/gi, "* 100"],
  [/\bthousand\b/gi, "* 1000"],
  [/\bmillion\b/gi, "* 1000000"],
]

function expandContractions(text: string): string {
  const sorted = Object.entries(CONTRACTIONS).sort((a, b) => b[0].length - a[0].length)
  let result = text
  for (const [contraction, expansion] of sorted) {
    const escaped = contraction.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    // Use word boundary equivalents; the lookbehind ensures we don't partially match
    const re = new RegExp(`(?<![a-z])${escaped}(?![a-z])`, "gi")
    result = result.replace(re, expansion)
  }
  return result
}

/**
 * Normalizes a raw query. Order matters — each step feeds the next.
 *
 * 1. NFKC Unicode normalization
 * 2. Normalize Unicode apostrophes to ASCII (U+2019 etc. → U+0027)
 * 3. Lowercase
 * 4. Strip leading slang/filler ("lmao", "omg", etc.)
 * 5. Detect and strip ELI5 prefix → wantsSimple = true
 * 6. Expand contractions ("what's" → "what is")
 * 7. Strip trailing punctuation
 * 8. Collapse whitespace
 * 9. Detect and strip one leading scaffold
 */
export function normalize(raw: string): NormalizeResult {
  // Step 1: NFKC
  let text = raw.normalize("NFKC")

  // Step 2: Normalize curly/smart apostrophes to ASCII apostrophe
  // Must happen before lowercase so the regex class is minimal
  text = text.replace(CURLY_APOSTROPHES, "'")

  // Step 3: Lowercase
  text = text.toLowerCase()

  // Step 4: Strip leading slang/filler words
  // Extended slang/filler prefix strip — runs once
  text = text.replace(/^(?:lmao|lol|omg|wtf|bruh|bro|dude|yo|ok|okay|well|so|uh|um|hmm|like|basically|literally|honestly|seriously|actually|wait|hey|hi|hello|ugh|eww|wow|omfg|holy\s+(?:shit|moly|cow|crap)|fr|ngl|tbh|lowkey|highkey)[,\s!]+/i, "").trim()

  // Step 5: Detect and strip ELI5 prefix
  let wantsSimple = false
  const eli5Match = ELI5_PREFIX.exec(text)
  if (eli5Match) {
    text = text.slice(eli5Match[0].length).trim()
    wantsSimple = true
  }

  // Step 5b: Strip possessive "'s" so "plane's engine" doesn't get spell-corrected to "planet engine"
  text = text.replace(/(\w+)'s\b/g, "$1")

  // Step 5c: Strip inline slang intensifiers that add no factual content.
  // "how tf does wifi work" → "how does wifi work"
  // "what the heck is dark matter" → "what is dark matter"
  // Runs BEFORE contraction expansion so the cleaned text feeds scaffold detection correctly.
  text = text
    .replace(/\b(?:tf|af|rn|ngl|imo|tbh|fwiw|smh|idk|idek|tho|tbt|btw|fyi|fr|lowkey|highkey|deadass|literally|honestly|actually|basically|genuinely)\b/gi, " ")
    .replace(/\bthe\s+(?:heck|hel+|freaking|freakin|bloody|damn|dang|darn)\b/gi, " ")
    // Strip placeholder/filler nouns before relative clauses: "the dude who", "the guy that"
    // "whos the dude who invented the telephone" → "whos who invented the telephone"
    .replace(/\b(?:the\s+)?(?:dude|guy|gal|girl|person|man|woman|folk|fella|bloke|chap)\s+(?:who|that|which)\b/gi, "who")
    .replace(/\s+/g, " ").trim()

  // Step 5d: Normalize "how come" → "why" so they route identically.
  // "how come fire is hot" → "why fire is hot" → scaffold/pipeline handles normally.
  // Preserve the rest of the query exactly — don't guess "does" vs "is" vs "do".
  text = text.replace(/^how\s+come\s+/i, "why ").trim()

  // Step 6: Expand contractions (now that apostrophes are ASCII and text is lowercase)
  text = expandContractions(text)

  // Step 7: Strip trailing punctuation
  text = text.replace(/[?!.,]+$/, "").trim()

  // Step 8: Collapse whitespace
  text = text.replace(/\s+/g, " ").trim()

  const normalized = text

  // Step 9: Detect and strip one leading scaffold
  let scaffoldKind: string | null = null
  let residual = normalized

  for (const [pattern, kind] of SCAFFOLDS) {
    const match = pattern.exec(normalized)
    if (match) {
      const stripped = normalized.slice(match[0].length).trim()
      if (stripped.length > 0) {
        scaffoldKind = kind
        residual = stripped
        break
      }
    }
  }

  return { normalized, scaffoldKind, residual, wantsSimple }
}
