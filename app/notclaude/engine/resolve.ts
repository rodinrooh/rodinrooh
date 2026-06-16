/**
 * Conversational query resolution — the ELIZA layer.
 *
 * Transforms ambiguous follow-up queries into self-contained search queries
 * using the conversation context (the entity/topic from the previous turn).
 *
 * Core techniques (inspired by ELIZA, 1966):
 *   1. Pattern matching — detect pronoun references, single-word follow-ups, topic changes
 *   2. Transformation rules — replace pronouns/references with the actual entity
 *   3. Context injection — when nothing matches, append context to avoid wild searches
 *
 * Examples:
 *   "how strong is it"        + ctx "gravity"       → "how strong is gravity"
 *   "who invented it"         + ctx "the internet"  → "who invented the internet"
 *   "eli5 that"               + ctx "DNA"           → "explain DNA simply eli5"
 *   "when"                    + ctx "moon landing"  → "when was moon landing"
 *   "wait theres other ones??"+ ctx "galaxy"        → "what are the different types of galaxy besides galaxy"
 *   "he went bankrupt once"   + ctx "elon musk"     → "elon musk went bankrupt once"
 */

// Filler words at the start of a query that carry no meaning
// NOTE: "wait" IS included here — "wait why?" = "why?" in conversational English
const FILLER_RE = /^(?:yo+|lmao+|lol|omg+|omfg|wtf+|bruh|bro|dude|man|ugh|hm+|haha|heh|lmfao|jfc|smh|ngl|idk|tbh|wait|rly|wtf|nah|lol|oh|ahh+|hmm+|dude|ugh|yikes|woah+|whoa+|daaamn+|woow+)\s+/gi
const OK_RE    = /^ok+\s+/gi
const FR_RE    = /^(?:fr|rn|tbh|actually|basically|literally|honestly)\s+/gi
const WAIT_EXCL_RE = /^(?:really|seriously|no\s+way|holy\s+\w+|omg)\s+/gi

// "ok completely different —" / "different question —" / "new topic —" / "changing topics —"
const TOPIC_CHANGE_RE = /(?:(?:completely|totally|absolutely)\s+different|different\s+(?:question|topic|thing)|new\s+(?:topic|question|thing)|changing\s+(?:topics?|subjects?)|forget\s+that|never\s+mind\s+that)\s*[—–\-]+\s*(.*)/i

// "ok fr last one — <query>" or "one more — <query>"
const LAST_ONE_RE = /^(?:(?:fr|ok)\s+)?(?:last\s+(?:one|question|thing)|one\s+more(?:\s+(?:thing|question))?)\s*[—–\-]+\s*/i

/**
 * Resolve a raw conversational query into a well-formed search query.
 * Returns both the resolved query and whether this was detected as a topic change.
 */
export function resolveQuery(rawQuery: string, context: string): { resolved: string; isNewTopic: boolean } {
  let q = rawQuery.trim()

  // Strip leading filler words (order matters: yo → ok → fr)
  q = q.replace(FILLER_RE, "").replace(OK_RE, "").replace(FR_RE, "").trim()

  // Topic change — return the new topic, mark as new
  const tc = q.match(TOPIC_CHANGE_RE)
  if (tc) return { resolved: tc[1].trim(), isNewTopic: true }

  // Strip "last one — " style prefixes
  q = q.replace(LAST_ONE_RE, "").trim()

  // Clean the query before anything else
  if (!q) return { resolved: rawQuery.trim(), isNewTopic: false }

  const ctx = context.trim()
  if (!ctx) return { resolved: q, isNewTopic: false }

  // ── Single question words ──────────────────────────────────────────────────
  if (/^(when|where|why|who|how)\??$/i.test(q)) {
    const verbMap: Record<string, string> = {
      when: "when was", where: "where is", why: "why did", who: "who is", how: "how does",
    }
    const word = q.replace(/\?$/, "").toLowerCase()
    return { resolved: `${verbMap[word] ?? word} ${ctx}`, isNewTopic: false }
  }

  // ── "eli5 [that/this/it]" ──────────────────────────────────────────────────
  if (/^eli5\s*(that|this|it)?\??$/i.test(q)) {
    return { resolved: `explain ${ctx} simply in plain english`, isNewTopic: false }
  }

  // ── "there's/theres other X??" ────────────────────────────────────────────
  const thereM = q.match(/^(?:wait\s+)?there'?s\s+(?:other\s+)?([\w\s]+?)\??$/i)
  if (thereM) {
    const noun = thereM[1].trim()
    return { resolved: `what are the different types of ${noun}`, isNewTopic: false }
  }

  // Strip surprise exclamation prefixes before pronoun resolution
  q = q.replace(WAIT_EXCL_RE, "").trim()
  if (!q) return { resolved: `what about ${ctx}`, isNewTopic: false }

  // ── Pronoun & reference replacement ───────────────────────────────────────
  const ctx2 = ctx  // separate const avoids closure capture issues in replace callbacks

  // Skip they/their/they're replacement if the query already has its own plural subject
  // (e.g., "why do humans cry when they're sad" — "they're" = "humans", not context)
  const hasOwnPluralSubject = /\b(humans?|people|animals?|plants?|cells?|molecules?|particles?|stars?|computers?|machines?|countries|nations|governments?|companies|teams?|users?|scientists?|researchers?)\b/i.test(q)

  let r = q
    // "the opposite" / "its opposite" → refers to the opposite of the current topic
    .replace(/\bthe\s+opposite(?:\s+of\s+it)?\b/gi, `the opposite of ${ctx2}`)
    // "the same thing" / "the same one"
    .replace(/\bthe\s+same\s+(?:thing|one)\b/gi, ctx2)
    // "it" / "it's"
    .replace(/\bit's\b|\bit'\s*s\b/gi, `${ctx2} is`)
    .replace(/\bit\b(?!')/gi, ctx2)
    // he/him/his/he's
    .replace(/\bhe'?s\b/gi, `${ctx2} is`)
    .replace(/\bhe\b(?!'s)/gi, ctx2)
    .replace(/\bhim\b/gi, ctx2)
    .replace(/\bhis\b/gi, `${ctx2}'s`)
    // she/her/she's
    .replace(/\bshe'?s\b/gi, `${ctx2} is`)
    .replace(/\bshe\b(?!'s)/gi, ctx2)
    .replace(/\bher\b(?!\s+own)/gi, ctx2)
    // this / that
    .replace(/\bthis\b/gi, ctx2)
    .replace(/\bthat\b/gi, ctx2)
    // "which one" → "which [ctx]"
    .replace(/\bwhich\s+one\b/gi, `which ${ctx2}`)

  // they/them/their/they're — only replace if no own plural subject in query
  // e.g. "why do humans cry when they're sad" → "they're" = "humans", not context
  if (!hasOwnPluralSubject) {
    r = r
      .replace(/\bthey'?re\b/gi, `${ctx2} are`)
      .replace(/\bthey'?ve\b/gi, `${ctx2} have`)
      .replace(/\bthey\b/gi, ctx2)
      .replace(/\bthem\b/gi, ctx2)
      .replace(/\btheir\b/gi, `${ctx2}'s`)
  }

  // If nothing changed AND the query is short/ambiguous, inject context
  if (r === q && isAmbiguous(q, ctx2)) {
    r = `${q} ${ctx2}`
  }

  return { resolved: r, isNewTopic: false }
}

/**
 * True if the query is genuinely ambiguous and needs context appended.
 * Only bare queries with no real topic word qualify — not "what is entropy",
 * not "why does light scatter", not anything with a clear subject.
 */
function isAmbiguous(q: string, ctx: string): boolean {
  const lower = q.toLowerCase()
  if (lower.includes(ctx.toLowerCase())) return false

  // Strip question words + auxiliary verbs from the front
  const stripped = lower
    .replace(/^(what|who|why|how|when|where|which|is|are|was|were|does|do|did|has|have|had|will|would|could|should|can|may|might)\s+/gi, "")
    .replace(/^(a|an|the|it|its|he|she|they|their|this|that|there|here)\s+/gi, "")
    .trim()

  // If no meaningful words remain, it's ambiguous
  const TRIVIAL = new Set(["?", "!", ".", "even", "ever", "ever?", "really", "actually", "still"])
  const words = stripped.split(/\s+/).filter(w => w.length > 1 && !TRIVIAL.has(w))
  return words.length === 0
}

/**
 * Extract the main entity/topic from a resolved query for tracking in the
 * next conversational turn.
 *
 * The entity becomes the context for pronoun resolution in the next query.
 * Uses pattern matching to pull out the subject, with a fallback to the
 * last 2-3 significant words.
 */
export function extractEntity(query: string): string {
  const q = query.replace(/[?!.,"]+$/, "").trim()

  const patterns: RegExp[] = [
    /(?:what\s+(?:is|are|was|were|even\s+is|even\s+are))\s+(?:a\s+|an\s+|the\s+)?([\w\s\-']{3,60}?)(?:\??$|\s+(?:and|for|to|of|in|about|called|named)\b)/i,
    /(?:who\s+(?:is|was|are|were))\s+([\w\s\-]{3,50}?)(?:\??$)/i,
    // "who first/originally/actually [verb] [entity]" → extract entity
    /^who\s+(?:\w+\s+){0,3}(?:invented|created|discovered|founded|designed|built|wrote|developed|described|proposed)\s+(?:a\s+|an\s+|the\s+)?([\w\s\-]{3,50}?)(?:\??$)/i,
    /(?:why\s+did|how\s+did|when\s+did)\s+([\w\s\-]{2,40}?)\s+(?:fail|happen|die|end|collapse|work|go|get|start|stop|come|become)/i,
    /(?:explain|eli5)\s+(?:the\s+|a\s+|an\s+)?([\w\s\-]{3,50}?)(?:\s+simply|\s+in\s+plain|\s+for\s+beginners|\s+in\s+simple|\??$)/i,
    /(?:when\s+was|when\s+did)\s+(?:the\s+)?([\w\s\-]{3,50}?)\s+(?:discover|prove|invent|born|die|happen|found|confirm|announ)/i,
    /(?:what\s+(?:caused|causes|happened\s+to|happened\s+with))\s+(?:the\s+)?([\w\s\-]{3,50}?)(?:\??$)/i,
    /(?:has\s+anyone|have\s+they)\s+(?:actually\s+)?(?:proven|proved|discovered|found|confirmed)\s+(?:that\s+)?([\w\s\-]{3,50}?)\s+(?:exists|is\s+real|works)/i,
    /(?:is|are|was|were)\s+(?:there\s+)?([\w\s\-]{3,50}?)\s+(?:real|true|proven|confirmed|possible)/i,
  ]

  for (const p of patterns) {
    const m = q.match(p)
    if (m?.[1]) {
      const entity = m[1].trim().replace(/^(a|an|the)\s+/i, "").replace(/\s+/g, " ")
      if (entity.length >= 2 && entity.length <= 70) return entity.toLowerCase()
    }
  }

  // Fallback: last 2-3 significant words (not stop words)
  const STOPS = new Set([
    "what", "why", "how", "when", "where", "who", "which", "is", "are", "was", "were",
    "did", "does", "do", "the", "a", "an", "of", "in", "to", "for", "and", "or", "on",
    "at", "by", "with", "has", "have", "had", "been", "be", "its", "not", "like", "just",
    "even", "some", "any", "other", "more", "also", "very", "really", "actually", "basically",
    "about", "into", "than", "from", "this", "that", "these", "those", "then", "them",
    "simply", "plain", "english", "simple", "basically", "explained", "meaning",
    "they", "their", "there", "here", "will", "would", "could", "should", "can", "may",
    "might", "must", "shall", "done", "ever", "never", "always", "still", "already",
    "again", "back", "out", "over", "after", "before", "between", "through", "during",
  ])

  const words = q
    .toLowerCase()
    .replace(/[?!,."]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPS.has(w) && !/^\d+$/.test(w))

  if (!words.length) return ""
  if (words.length <= 3) return words.join(" ")
  return words.slice(-2).join(" ")
}
