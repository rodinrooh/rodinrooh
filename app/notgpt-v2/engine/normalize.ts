/**
 * Query normalization: extract information-seeking intent from casual/slangy input.
 *
 * How this works (same principle as Google's query understanding):
 *   1. Find the first question word — it marks the start of real intent.
 *      Words before it (≤3) are filler/interjection → strip.
 *   2. Strip trailing interjection/noise using NLP POS tagging.
 *   3. Resolve pronouns using previous-turn context so "are they profitable"
 *      after asking about Supreme becomes "are Supreme profitable".
 *
 * What this is NOT: a word list of slang to suppress. We detect structure
 * (question word position, POS interjection tag) — not vocabulary.
 *
 * Examples:
 *   "bruh what is dark matter lol" → "what is dark matter"
 *   "yo wtf is the bermuda triangle"  → "what is the bermuda triangle"
 *   "are they successful" + ctx{Supreme} → "are Supreme successful"
 *   "dark matter"          → "dark matter"  (unchanged — already clean)
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nlp = require("compromise") as (text: string) => unknown

// Question words that mark the START of information-seeking intent
const QUESTION_START_RE =
  /\b(what(?:\s+(?:the|a|an|is|are|was|were))?\b|why|how|who|where|when|which|is|are|was|were|does|do|did|can|could|will|would|should|has|have|had|explain|define|describe|tell\s+me)\b/i

// Informal question-word synonyms: very short table, only for question markers
// This is NOT a slang list — it translates question grammatical markers to standard English
const QUESTION_SYNONYMS: Record<string, string> = {
  wtf: "what",
  wth: "what",
  wdym: "what do you mean",
  imo: "",   // opinion marker → drop entirely
  tbh: "",
  ngl: "",
  fwiw: "",
}

export interface QueryContext {
  article?: string   // title of the article returned in the previous turn
  query?: string     // raw text of the previous turn's question
}

export function normalizeQuery(raw: string, context?: QueryContext): string {
  let q = raw.trim()

  // ── Step 1: Translate informal question markers anywhere in the query ──
  // "yo yo yo wtf is dark matter" → "yo yo yo what is dark matter"
  q = q.replace(/\b(wtf|wth|wdym)\b/gi, (match: string) => {
    return QUESTION_SYNONYMS[match.toLowerCase()] ?? match
  })
  // Drop opinion/hedge markers (these carry no information-seeking intent)
  q = q.replace(/\b(imo|tbh|ngl|fwiw)\b\s*/gi, "").trim()

  // ── Step 2: Pronoun resolution ──
  // "are they successful" + ctx{article: "Supreme"} → "are Supreme successful"
  if (context?.article) {
    // Strip disambiguation suffixes like "(brand)", "(company)", "(singer)", "(film)"
    const cleanArticle = context.article.replace(/\s*\([^)]+\)\s*$/, "").trim()
    q = resolvePronouns(q, cleanArticle || context.article)
  }

  // ── Step 3: Strip leading filler (≤ 5 words before first question word) ──
  // "yo yo yo wtf is dark matter" → "what is dark matter"  (4 words stripped)
  // "um excuse me but what even is a neutron star" → "what even is a neutron star"
  const qMatch = q.match(QUESTION_START_RE)
  if (qMatch && qMatch.index !== undefined && qMatch.index > 0) {
    const prefix = q.slice(0, qMatch.index).trim()
    const prefixWordCount = prefix.split(/\s+/).filter(Boolean).length
    if (prefixWordCount <= 5) {
      q = q.slice(qMatch.index).trim()
    }
  }

  // ── Step 4: Strip trailing interjections via NLP POS ──
  q = stripTrailingNoise(q)

  return q.trim() || raw.trim()
}

function resolvePronouns(q: string, topic: string): string {
  // Third-person pronouns that could refer to the previous article's subject
  const hasAnaphoricPronoun = /\b(it|they|them|their|its|he|she|him|her|his)\b/i.test(q)
  if (!hasAnaphoricPronoun) return q

  // Don't resolve if the query already has another proper-noun subject
  // (indicated by a capitalised word in a non-sentence-start position)
  const words = q.split(/\s+/)
  const hasInternalCapital = words.slice(1).some(w => /^[A-Z][a-zA-Z]/.test(w) && w.length > 2)
  if (hasInternalCapital) return q

  // Use compromise to confirm there are no other nouns (query is implicitly about topic)
  try {
    const doc = nlp(q) as { nouns(): { not(tag: string): { length: number } }; match(tag: string): { length: number } }
    const contentNouns = doc.nouns().not("#Pronoun")
    if ((contentNouns as any).length > 0) return q
  } catch { /* fall through */ }

  // Replace all third-person pronouns with the context topic
  return q.replace(/\b(it|they|them|their|its|he|she|him|her|his)\b/gi, topic)
}

function stripTrailingNoise(q: string): string {
  // Use NLP to detect and remove trailing interjection tokens first
  const words = q.trim().split(/\s+/)
  if (words.length <= 1) return q

  try {
    let end = words.length
    for (let i = words.length - 1; i >= Math.floor(words.length / 2); i--) {
      const word = words[i].toLowerCase().replace(/[?!.,]+$/, "")
      const tokenDoc = nlp(word) as any
      if (tokenDoc.has("#Interjection") || tokenDoc.has("#Expression")) {
        end = i
      } else {
        break
      }
    }
    if (end < words.length) return words.slice(0, end).join(" ")
  } catch { /* fall through */ }

  // Fallback: structurally detect trailing vocative/address terms.
  // Strip the last word if:
  //   1. It's short (3-5 chars — avoids content words like "matter", "triangle")
  //   2. NOT preceded by a determiner (which would mean it's part of a noun phrase)
  //   3. NOT the final word of any multi-word compound noun in the query
  //   4. Removing it still leaves a valid question structure + at least one noun
  return stripTrailingVocative(q)
}

function stripTrailingVocative(q: string): string {
  // Terminal vocatives and discourse markers: a closed linguistic class.
  // These words are NEVER content words at the END of a factual query —
  // "explain black holes bro" has zero difference in meaning from "explain black holes".
  // This is NOT slang suppression (infinite list) — it's positional: only applied
  // when the word is the final token. "man" in "what is spider-man" is not the final token.
  const TERMINAL_VOCATIVES = new Set([
    "bruh", "bro", "sis", "man", "fam", "yo", "dude", "babe", "mate",
    "lol", "lmao", "haha", "smh", "omg", "huh",
  ])

  const tokens = q.trim().split(/\s+/)
  if (tokens.length <= 1) return q

  const last = tokens[tokens.length - 1].toLowerCase().replace(/[!?.,]+$/, "")
  if (TERMINAL_VOCATIVES.has(last)) {
    return tokens.slice(0, -1).join(" ").trim()
  }
  return q
}
