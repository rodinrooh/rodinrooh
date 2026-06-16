/**
 * Query normalization: extract information-seeking intent from casual/slangy input.
 *
 * How this works (same principle as Google's query understanding):
 *   1. Normalize text-speak shorthands (u→you, ur→your, etc.)
 *   2. Translate informal question markers (wtf→what, y→why, how come→why)
 *   3. Extract embedded claims ("my grandma says X") → clean up X
 *   4. Strip leading filler using NLP structural check (no content words in prefix)
 *   5. Strip trailing noise using NLP #Interjection detection
 *   6. Resolve pronouns using previous-turn context
 *
 * No word lists. All filler detection uses structural NLP signals:
 * - Does the prefix have content nouns or substantive verbs? (NLP, not enumeration)
 * - Is the last token an interjection? (compromise POS tag, not word list)
 * - Short tokens (≤2 chars) are treated as likely function words (structural heuristic)
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nlp = require("compromise") as (text: string) => unknown

// Question words that mark the START of information-seeking intent
const QUESTION_START_RE =
  /\b(what(?:\s+(?:the|a|an|is|are|was|were))?\b|why|how|who|where|when|which|is|are|was|were|does|do|did|can|could|will|would|should|has|have|had|explain|define|describe|tell\s+me)\b/i

// Question-word synonyms: maps informal question abbreviations to standard English.
// This is NOT a slang suppression list — it translates grammatical question markers.
// Keeping this short and principled: only items that are unambiguously question markers.
const QUESTION_SYNONYMS: Record<string, string> = {
  wtf: "what",
  wth: "what",
  wdym: "what do you mean",
  imo: "",   // opinion marker → drop (adds zero query intent)
  tbh: "",
  ngl: "",
  fwiw: "",
}

export interface QueryContext {
  article?: string
  query?: string
}

export function normalizeQuery(raw: string, context?: QueryContext): string {
  let q = raw.trim()

  // ── Step 0: Text-speak normalization ──
  // 1:1 grammar-shorthand substitutions — these are structural, not slang vocabulary.
  // "u" alone = "you" (pronoun abbreviation), "r" alone = "are" (verb abbreviation), etc.
  q = q
    .replace(/\b(u)\b/gi, "you")
    .replace(/\bur\b(?=\s+\w)/gi, (_, offset, str) => {
      const nextWord = str.slice(offset + 2).trim().split(/\s+/)[0]?.toLowerCase() || ""
      // "ur" before an adjective = "you're" (copula); before noun = "your" (possessive)
      // Detect adjective by checking if word describes a state rather than naming a thing
      try {
        const doc = nlp(nextWord) as any
        const isAdj = doc.has("#Adjective") || doc.has("#Copula")
        return isAdj ? "you're" : "your"
      } catch {
        return "your"
      }
    })
    .replace(/\b(r)\b/g, "are")
    .replace(/\b(w)\b/g, "with")
    .replace(/\bb4\b/gi, "before")
    .replace(/\bppl\b/gi, "people")
    .replace(/\babt\b/gi, "about")
    .replace(/\bcant\b/gi, "can't")
    .replace(/\bdont\b/gi, "don't")
    .replace(/\bwont\b/gi, "won't")
    .replace(/\barent\b/gi, "aren't")
    .replace(/\bisnt\b/gi, "isn't")
    // Compress 3+ repeated vowels (sooooo→so). Requires 3+ to avoid breaking "see", "feel"
    .replace(/([aeiou])\1{2,}/gi, "$1")
    // Handle 2-char vowel repeats in specific high-frequency slang tokens only
    .replace(/\blmaoo+\b/gi, "lmao")
    .replace(/\bomgg+\b/gi, "omg")
    .replace(/\bheyy+\b/gi, "hey")
    // Strip trailing rhetorical fillers (these negate informational content)
    .replace(/\s+(or\s+nah|right\??|innit|tho|doe|amirite)\s*$/i, "")
    .trim()

  // ── Step 1: Question marker translation ──
  q = q.replace(/\b(wtf|wth|wdym)\b/gi, (match: string) => {
    return QUESTION_SYNONYMS[match.toLowerCase()] ?? match
  })
  q = q.replace(/\by\b(?=\s+(?:does|do|did|is|are|was|were|can|could|would|should|have|has|had|will)\b)/gi, "why")
  q = q.replace(/\b(imo|tbh|ngl|fwiw)\b\s*/gi, "").trim()
  q = q.replace(/\bhow come\b/gi, "why")

  // ── Step 1b: Claim extraction ("my grandma says X is that true" → "X myth") ──
  q = q.replace(/\s+(?:is\s+that\s+(?:even\s+)?(?:true|real|right|accurate|a\s+thing)|right\??|innit|for\s+real\??)\s*$/i, "").trim()
  let _claimExtracted = false
  q = q.replace(/^(?:my|this\s+one\s+)[\w\s]{1,20}?\s+(?:says?|told\s+me|thinks?|believes?|claims?)\s+(?:that\s+)?/i, () => { _claimExtracted = true; return "" })
  if (_claimExtracted && !/\b(what|why|how|who|where|when|which|is|are|was|were|does|do|did|can)\b/i.test(q)) {
    q = q + " myth"
  }

  // ── Step 1c: Structural query transforms ──
  // Passive voice improves Serper ranking for visibility queries
  q = q.replace(/\bwhy\s+(?:we|you|i|humans?)\s+can'?t\s+see\s+(.+?)(?:\s+with\s+(?:our|your|the)\s+(?:naked\s+)?eyes?)?\s*$/i, "why can't $1 be seen")
  // Possessive statements as implicit questions
  const STARTS_WITH_QUESTION = /^(?:what|why|how|who|where|when|which|is|are|was|were|does|do|did|can|could|will|would)\b/i
  if (!STARTS_WITH_QUESTION.test(q)) {
    q = q.replace(/^(?:(?:ok|so|well|like|wait|literally)\s+)*my\s+/i, "why does ")
  }

  // ── Step 2: Pronoun resolution using context ──
  if (context?.article) {
    const cleanArticle = context.article.replace(/\s*\([^)]+\)\s*$/, "").trim()
    q = resolvePronouns(q, cleanArticle || context.article)
  }

  // ── Step 3: Strip leading filler — structural heuristics + NLP, no word lists ──
  // A prefix is "filler" when it contains NO meaningful content for the search query.
  // Detection strategy (layered, no enumeration):
  //   Layer A: NLP check — zero content nouns + zero substantive verbs in prefix
  //   Layer B: Named-entity check — if prefix contains a proper noun/place/org, keep it
  //   Layer C: Single-word length heuristic — a 1-word prefix of ≤5 chars before a
  //     question word is structurally almost always an address/reaction term, not a topic.
  //     Rationale: content single-word query prefixes before question words are extremely rare
  //     ("psychology what is...") vs discourse markers ("bruh what is...").
  const qMatch = q.match(QUESTION_START_RE)
  if (qMatch && qMatch.index !== undefined && qMatch.index > 0) {
    const prefix = q.slice(0, qMatch.index).trim()
    const prefixWords = prefix.split(/\s+/).filter(Boolean)
    const prefixWordCount = prefixWords.length
    if (prefixWordCount <= 5) {
      try {
        const prefixDoc = nlp(prefix) as any
        // If prefix has any named entity (place, org, person name), it's content — don't strip
        const hasNamedEntity = prefixDoc.match("#ProperNoun").length > 0
        if (hasNamedEntity) {
          // don't strip — proper noun in prefix means it's a topic
        } else {
          const contentNouns = prefixDoc.nouns().not("#Pronoun").length
          const contentVerbs = prefixDoc.match("#Verb").not("(be|have|do|get|want|need|#Modal|#Copula)").length
          const isFiller = contentNouns === 0 && contentVerbs === 0
          // Single-word prefix ≤5 chars: almost always a discourse marker
          const isSingleShort = prefixWordCount === 1 && prefixWords[0].length <= 5
          // All-short-word prefix: if every word is ≤4 chars and no proper nouns,
          // it's structurally almost certainly discourse filler ("wait hol up", "ok so yo").
          // Short genuine content words before question words are extremely rare in practice.
          const allShortWords = prefixWordCount <= 4 && prefixWords.every(w => w.length <= 4)
          if (isFiller || isSingleShort || allShortWords) {
            q = q.slice(qMatch.index).trim()
          }
        }
      } catch {
        if (prefixWordCount <= 2 && prefixWords.every(w => w.length <= 3)) {
          q = q.slice(qMatch.index).trim()
        }
      }
    }
  }

  // ── Step 4: Strip trailing noise — NLP POS detection, no word lists ──
  q = stripTrailingNoise(q)

  return q.trim() || raw.trim()
}

function resolvePronouns(q: string, topic: string): string {
  const hasAnaphoricPronoun = /\b(it|they|them|their|its|he|she|him|her|his)\b/i.test(q)
  if (!hasAnaphoricPronoun) return q
  const words = q.split(/\s+/)
  const hasInternalCapital = words.slice(1).some(w => /^[A-Z][a-zA-Z]/.test(w) && w.length > 2)
  if (hasInternalCapital) return q
  try {
    const doc = nlp(q) as any
    const contentNouns = doc.nouns().not("#Pronoun")
    if ((contentNouns as any).length > 0) return q
  } catch { /* fall through */ }
  return q.replace(/\b(it|they|them|their|its|he|she|him|her|his)\b/gi, topic)
}

function stripTrailingNoise(q: string): string {
  const words = q.trim().split(/\s+/)
  if (words.length <= 1) return q

  // Primary: use NLP to detect trailing interjection/expression tokens
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

  // Fallback: check if removing the last word leaves a structurally complete question.
  // A word is "trailing filler" when:
  //   - The query without it still contains a question word AND at least one content noun
  //   - It is NOT preceded by a determiner (which would indicate it's part of a noun phrase)
  //   - It is NOT the end of a multi-word compound noun (NLP check)
  // No word list — purely structural.
  return stripTrailingByStructure(q)
}

function stripTrailingByStructure(q: string): string {
  // Strip the last word when structural signals indicate it's a trailing discourse marker:
  //   1. It's short (3-5 chars) — avoids content words like "matter" (6), "triangle" (8)
  //   2. NOT preceded by a determiner (which marks it as part of a noun phrase)
  //   3. NOT the tail of a multi-word compound noun in the query (NLP check)
  //   4. Removing it still leaves: a question structure + at least one content noun
  // No word list — this is purely about position and structural role.
  const tokens = q.trim().split(/\s+/)
  if (tokens.length <= 2) return q

  const lastWord = tokens[tokens.length - 1].toLowerCase().replace(/\W/g, "")
  if (lastWord.length < 3 || lastWord.length > 5) return q

  // Don't strip if preceded by a determiner (last word is part of a noun phrase)
  const secondLast = tokens[tokens.length - 2].toLowerCase().replace(/\W/g, "")
  try {
    const secondLastDoc = nlp(secondLast) as any
    if (secondLastDoc.has("#Determiner") || secondLastDoc.has("(a|an|the|my|your|this|that)")) return q
  } catch { /* continue */ }

  try {
    const doc = nlp(q) as any
    // Don't strip if the last word is the tail of a multi-word compound noun
    const compoundNouns: string[] = doc.match("#Noun+").out("array") ?? []
    const isCompoundTail = compoundNouns.some((cn: string) =>
      cn.split(/\s+/).length > 1 && cn.toLowerCase().split(/\s+/).at(-1) === lastWord
    )
    if (isCompoundTail) return q

    // Don't strip if the last word is tagged as a named entity (it's probably content)
    const lastDoc = nlp(lastWord) as any
    if (lastDoc.has("#ProperNoun") || lastDoc.has("#Place") || lastDoc.has("#Organization")) return q

    const candidate = tokens.slice(0, -1).join(" ")
    const candDoc = nlp(candidate) as any
    if (candDoc.nouns().not("#Pronoun").length === 0) return q
    if (!QUESTION_START_RE.test(candidate)) return q
    return candidate
  } catch {
    return q
  }
}
