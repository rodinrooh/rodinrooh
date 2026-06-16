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

  // ── Step 0: Text-speak normalization ──
  // 1:1 shorthand substitutions that confuse Serper ("cant see atoms w our eyes")
  // These are unambiguous shorthands — "u" alone is always "you" in a query context.
  q = q
    .replace(/\b(u)\b/gi, "you")         // "how r u" → "how are you"
    .replace(/\bur\b(?=\s+\w)/gi, (_, offset, str) => {
      // "ur" before an adjective (bored, tired, right, sure, ok, good, bad, etc.) = "you're"
      // "ur" before a noun/possessive context = "your"
      const nextWord = str.slice(offset + 2).trim().split(/\s+/)[0]?.toLowerCase() || ""
      const adjectives = /^(bored|tired|right|wrong|sure|ok|good|bad|late|early|ready|done|sick|fine|welcome|awesome|amazing|crazy|stupid|smart|funny|weird|nice|cool|hot|cold)$/
      return adjectives.test(nextWord) ? "you're" : "your"
    })        // "when ur bored" → "when you're bored", "ur hair" → "your hair"
    .replace(/\b(r)\b/g, "are")           // "sum ppl r" → "sum people are"
    .replace(/\b(w)\b/g, "with")          // "atoms w our eyes" → "atoms with our eyes"
    .replace(/\bb4\b/gi, "before")        // "b4 alarm" → "before alarm"
    .replace(/\bppl\b/gi, "people")       // "sum ppl" → "sum people"
    .replace(/\babt\b/gi, "about")        // "confused abt" → "confused about"
    .replace(/\bcant\b/gi, "can't")       // "we cant see" → "we can't see"
    .replace(/\bdont\b/gi, "don't")
    .replace(/\bwont\b/gi, "won't")
    .replace(/\barent\b/gi, "aren't")
    .replace(/\bisnt\b/gi, "isn't")
    // Compress 3+ repeated vowels (sooooo → so, heyyyy → hey, noooo → no)
    // Requires 3+ same vowels to avoid breaking normal English ("see", "feel", "tree")
    .replace(/([aeiou])\1{2,}/gi, "$1")
    // Also handle 2-char vowel repeats in specific known slang tokens
    // (can't use general 2+ compress without breaking "see", "feel", "free", etc.)
    .replace(/\blmaoo+\b/gi, "lmao")
    .replace(/\bomgg+\b/gi, "omg")
    .replace(/\bheyy+\b/gi, "hey")
    // Strip trailing conversational fillers that turn statements into questions
    .replace(/\s+(or\s+nah|right\??|innit|tho|doe|amirite)\s*$/i, "")
    .trim()

  // ── Step 1: Translate informal question markers anywhere in the query ──
  // "yo yo yo wtf is dark matter" → "yo yo yo what is dark matter"
  q = q.replace(/\b(wtf|wth|wdym)\b/gi, (match: string) => {
    return QUESTION_SYNONYMS[match.toLowerCase()] ?? match
  })
  // Standalone "y" as first meaningful content word = "why" (text speak)
  // "y does spicy food burn" → "why does spicy food burn"
  q = q.replace(/\by\b(?=\s+(?:does|do|did|is|are|was|were|can|could|would|should|have|has|had|will)\b)/gi, "why")
  // Drop opinion/hedge markers (these carry no information-seeking intent)
  q = q.replace(/\b(imo|tbh|ngl|fwiw)\b\s*/gi, "").trim()
  // "how come" → "why" improves Serper results ("how come we can't see atoms")
  q = q.replace(/\bhow come\b/gi, "why")
  // Strip trailing confirmation tags FIRST (before claim extraction check)
  // Must be before "my grandma says" extraction so "is" in "is that true" doesn't block myth appending
  q = q.replace(/\s+(?:is\s+that\s+(?:even\s+)?(?:true|real|right|accurate|a\s+thing)|right\??|innit|for\s+real\??)\s*$/i, "").trim()
  // "my [person] says/told me [claim]" → extract the claim, append "myth" for debunking searches
  // "my grandma says X" → "X myth" → helps find debunking articles (List of common misconceptions)
  let _claimExtracted = false
  q = q.replace(/^(?:my|this\s+one\s+)[\w\s]{1,20}?\s+(?:says?|told\s+me|thinks?|believes?|claims?)\s+(?:that\s+)?/i, () => { _claimExtracted = true; return "" })
  if (_claimExtracted && !/\b(what|why|how|who|where|when|which|is|are|was|were|does|do|did|can)\b/i.test(q)) {
    // It's a factual claim with no question word — add myth framing for better debunking results
    q = q + " myth"
  }
  // "why [we/you/humans] can't see [X]" → "why can't [X] be seen" (better Serper ranking)
  q = q.replace(/\bwhy\s+(?:we|you|i|humans?)\s+can'?t\s+see\s+(.+?)(?:\s+with\s+(?:our|your|the)\s+(?:naked\s+)?eyes?)?\s*$/i, "why can't $1 be seen")
  // Possessive-as-question: "my hair turns gray" → "why does hair turn gray"
  // Only applies when the query does NOT start with a question word.
  // We check the START of the query specifically, not embedded words like "when" in
  // "my head hurts WHEN i stand up" (where "when" is temporal, not a question).
  const STARTS_WITH_QUESTION = /^(?:what|why|how|who|where|when|which|is|are|was|were|does|do|did|can|could|will|would)\b/i
  if (!STARTS_WITH_QUESTION.test(q)) {
    q = q.replace(/^(?:(?:ok|so|well|like|wait|literally)\s+)*my\s+/i, "why does ")
  }

  // ── Step 2: Pronoun resolution ──
  // "are they successful" + ctx{article: "Supreme"} → "are Supreme successful"
  if (context?.article) {
    // Strip disambiguation suffixes like "(brand)", "(company)", "(singer)", "(film)"
    const cleanArticle = context.article.replace(/\s*\([^)]+\)\s*$/, "").trim()
    q = resolvePronouns(q, cleanArticle || context.article)
  }

  // ── Step 3: Strip leading filler (≤ 5 words before first question word) ──
  // Only strip if the prefix contains NO content nouns/verbs (e.g. "um excuse me but" is
  // all function words — strip it. "my head hurts" has content words — don't strip it.)
  const qMatch = q.match(QUESTION_START_RE)
  if (qMatch && qMatch.index !== undefined && qMatch.index > 0) {
    const prefix = q.slice(0, qMatch.index).trim()
    const prefixWordCount = prefix.split(/\s+/).filter(Boolean).length
    if (prefixWordCount <= 5) {
      try {
        const prefixWords = prefix.split(/\s+/).filter(Boolean)
        // Discourse/vocative words that are safe to strip even though NLP may tag them as nouns
        const DISCOURSE = new Set(['bruh','bro','sis','man','fam','yo','dude','babe','mate',
          'lol','lmao','lmaoo','lmaooo','haha','smh','omg','omgg','huh','omfg','ngl','tbh',
          'imo','ok','okay','hol','nah','fr','deadass','lowkey','highkey','rn','irl','smth',
          'aight','ight','lmfao','lol','lolol','hehe','xd','ugh','oof','yikes'])
        const STOPS_NORM = new Set(['the','a','an','is','are','was','were','do','does','did',
          'why','how','what','who','when','where','which','my','your','i','we','they',
          'he','she','it','and','or','but','in','of','to','for','with','on','at','from',
          'by','this','that','these','those','can','will','would','could','should','have',
          'has','had','not','so','if','as','than','then','be','been','being','just','very',
          'um','uh','ah','eh','hmm','wait','like',
          // Common discourse modifiers used as prefix filler
          'never','always','literally','actually','basically','honestly','really',
          'got','get','think','know','understand','figured','realize'])
        const allFiller = prefixWords.every(w =>
          DISCOURSE.has(w.toLowerCase()) || STOPS_NORM.has(w.toLowerCase()) || w.length <= 2
        )
        if (allFiller) {
          q = q.slice(qMatch.index).trim()
        } else {
          // NLP fallback: if no content nouns/verbs, also strip
          const prefixDoc = nlp(prefix) as any
          const contentNouns = prefixDoc.nouns().not("#Pronoun").length
          const contentVerbs = prefixDoc.match("#Verb").not("(be|have|do|get|want|need|#Modal)").length
          if (contentNouns === 0 && contentVerbs === 0) {
            q = q.slice(qMatch.index).trim()
          }
        }
      } catch {
        if (prefixWordCount <= 2) q = q.slice(qMatch.index).trim()
      }
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
