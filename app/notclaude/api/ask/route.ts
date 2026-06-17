import { NextRequest, NextResponse } from "next/server"
import { retrieveBestPassage } from "../../engine/retrieve"
import { resolveQuery, extractEntity, stripFiller, hasAnaphoricReference } from "../../engine/resolve"
import { detectTopicChange } from "../../engine/topicDetect"

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nlpLib = require("compromise") as (text: string) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  topics(): any; match(p: string): any; nouns(): any; not(p: string): any; terms(): any; out(f: "array"): string[]; found: boolean
}

/**
 * Extract a concise entity string from the response for conversation tracking.
 *
 * Page titles are SEO garbage ("Tariffs Definition | Tax Foundation",
 * "Ozempic® Pen? | Official Site") — never use them as entity sources.
 *
 * Priority:
 * 1. Wikipedia URL slug — canonical, always clean
 * 2. Grammatical subject of the first sentence in the passage — this is
 *    what the passage is actually ABOUT, structurally. "Tariffs are taxes..."
 *    → subject before copula = "tariffs". "Ozempic is the only GLP-1..."
 *    → "ozempic". Uses copula position, not POS tags (brand names like
 *    "Ozempic" are misclassified as Adjective by compromise's lexicon).
 * 3. URL path segment that appears in the passage — cross-validates the URL
 *    against actual content without using the title string.
 * 4. Query-based NLP as last resort.
 */
function entityFromResult(
  result: { url: string; title: string; passage: string } | null,
  resolvedQuery: string,
  fallback: string
): string {
  if (!result) return extractEntity(resolvedQuery) || fallback

  // ── 1. Wikipedia URL slug ────────────────────────────────────────────────
  try {
    const u = new URL(result.url)
    if (u.hostname.includes("wikipedia.org")) {
      const slug = decodeURIComponent(u.pathname.replace(/^\/wiki\//, ""))
        .replace(/_/g, " ").trim()
      if (slug && slug.length < 80 && !slug.includes("/")) return slug.toLowerCase()
    }
  } catch { /* ignore */ }

  // ── 2. Grammatical subject from first sentence of passage ─────────────────
  // The subject of "X is Y" / "X are Y" sentences is what the passage is about.
  // We find it by locating the first copula (is/are/was/were) and taking everything
  // before it — position-based, not relying on POS tags which misclassify brand names.
  const subjectEntity = extractSubjectFromPassage(result.passage)
  if (subjectEntity && subjectEntity.length >= 2) return subjectEntity

  // ── 3. URL path segment that appears in passage ───────────────────────────
  // The URL path often encodes the topic cleanly. We validate against the passage
  // text so SEO-stuffed path segments are rejected.
  const urlEntity = extractFromURLPath(result.url, result.passage)
  if (urlEntity && urlEntity.length >= 2) return urlEntity

  // ── 4. Query-based extraction ─────────────────────────────────────────────
  return extractEntity(resolvedQuery) || fallback
}

/**
 * Extract the grammatical subject from the first sentence of a passage.
 * Finds the copula verb (is/are/was/were) and returns everything before it.
 * Works for brand names, technical terms, and other words that compromise
 * misclassifies because they're not in its lexicon.
 */
function extractSubjectFromPassage(passage: string): string {
  const cleaned = passage.replace(/[®™©]/g, "").trim()
  const firstSentence = cleaned.split(/(?<=[.!?])\s+/)[0] || cleaned

  const doc = nlpLib(firstSentence)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const terms: Array<{ text: string; tags: string[] }> = (doc as any).json()[0]?.terms ?? []

  // Find first copula — separates subject from predicate
  const copulaIdx = terms.findIndex(t => t.tags?.includes("Copula"))
  if (copulaIdx > 0) {
    const subject = terms
      .slice(0, copulaIdx)
      .filter(t => !t.tags?.includes("Determiner") && !t.tags?.includes("QuestionWord"))
      .map(t => t.text).join(" ").trim()
    if (subject.length >= 2 && subject.length <= 60) return subject.toLowerCase()
  }

  // Fallback: first term that starts with an uppercase letter (likely a named entity
  // even if compromise doesn't recognize it)
  if (terms[0]?.text && /^[A-Z]/.test(terms[0].text) && terms[0].text !== "I") {
    const cleaned2 = terms[0].text.replace(/[^a-zA-Z0-9 ]/g, "").toLowerCase().trim()
    if (cleaned2.length >= 2) return cleaned2
  }

  return ""
}

/**
 * Extract entity from URL path, validated against the passage.
 * Split path into segments, find the one whose content appears in the passage.
 */
function extractFromURLPath(url: string, passage: string): string {
  try {
    const u = new URL(url)
    const passageLower = passage.toLowerCase().replace(/[®™©]/g, "")
    const segments = u.pathname.split("/").filter(Boolean)

    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i].replace(/\.\w+$/, "").replace(/[-_]/g, " ")
      if (seg.length < 3) continue
      // Use NLP to extract content words from the slug (no function words)
      const doc = nlpLib(seg)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const slgTerms: Array<{ text: string; tags: string[] }> = (doc as any).json()[0]?.terms ?? []
      const contentTerms = slgTerms.filter(
        t => !t.tags?.includes("QuestionWord") && !t.tags?.includes("Auxiliary") &&
             !t.tags?.includes("Determiner") && !t.tags?.includes("Copula") &&
             t.text.length > 2
      )
      if (contentTerms.length === 0) continue
      const candidate = contentTerms.map(t => t.text).join(" ").toLowerCase()
      // Validate: the candidate must appear (or a significant word from it) in the passage
      const words = candidate.split(/\s+/).filter(w => w.length > 3)
      if (words.length > 0 && words.some(w => passageLower.includes(w))) {
        return candidate
      }
    }
  } catch { /* ignore */ }
  return ""
}

/**
 * Extract the main topic entity from a page title using NLP.
 * No stop-word arrays. Uses compromise POS categories to identify
 * non-function words (proper nouns, named entities, content nouns).
 *
 * Structural cleaning (strip " | Site" suffixes, subtitle separators) is
 * pattern-based on punctuation, which is different from word lists.
 */
function entityFromTitleNLP(rawTitle: string): string {
  // Step 1: structural cleanup — punctuation-based, not word-based
  let title = rawTitle
    // Strip " | site name" or " - site name" at end
    .replace(/\s*[|–]\s*.{2,80}$/, "")
    // Strip "Word: subtitle" — colon-based subtitle separator
    .replace(/\s*:\s*.{3,80}$/, "")
    // Strip " - subtitle" at end
    .replace(/\s*-\s*.{3,80}$/, "")
    .trim()

  if (!title) return ""

  try {
    const doc = nlpLib(title)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const titleTerms: Array<{ text: string; tags: string[] }> = (doc as any).json()[0]?.terms ?? []

    // Named entities / topics first (most precise)
    const topics = doc.topics().out("array") as string[]
    if (topics.length > 0) return topics[0].toLowerCase().slice(0, 80)

    // Structural: detect "DESCRIPTOR [preposition] ENTITY" titles (e.g. "Introduction to X").
    // Allow preposition at index >= 1 to catch "Introduction TO Black Holes".
    // Build compound nouns by including preceding Adjective modifiers ("Black" + "Holes").
    const firstPrepIdx = titleTerms.findIndex(
      (t, i) => i >= 1 && t.tags?.includes("Preposition")
    )
    if (firstPrepIdx !== -1 && firstPrepIdx <= 6) {
      const after = titleTerms.slice(firstPrepIdx + 1)
      let entity = ""
      for (let j = 0; j < after.length && !entity; j++) {
        const t = after[j]
        if (t.tags?.includes("Noun") && !t.tags?.includes("Pronoun") && !t.tags?.includes("Verb") && t.text.length > 2 && !/^\d+$/.test(t.text)) {
          const prev = j > 0 ? after[j - 1] : null
          const mod = prev && (prev.tags?.includes("Adjective") || prev.tags?.includes("ProperNoun")) ? prev.text + " " : ""
          entity = (mod + t.text).toLowerCase()
        }
      }
      if (entity) return entity
    }

    // Content nouns BEFORE ProperNoun — compound phrases ("Dark Matter") are more
    // accurate than ProperNoun which only returns the head noun ("Matter").
    // Skip noun phrases containing embedded Verbs ("radiation works" → "works" is Verb).
    const nouns = doc.nouns().not("#Pronoun").out("array") as string[]
    for (const noun of nouns) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nTerms: Array<{ tags: string[] }> = (nlpLib(noun) as any).json()[0]?.terms ?? []
      if (!nTerms.some(t => t.tags?.includes("Verb") && !t.tags?.includes("Noun"))) {
        const clean = noun.replace(/^(a|an|the)\s+/i, "").trim().toLowerCase()
        if (clean.length >= 2 && clean.split(" ").length <= 4) return clean.slice(0, 80)
      }
    }

    // ProperNoun as final fallback
    const proper = doc.match("#ProperNoun+").out("array") as string[]
    if (proper.length > 0) return proper[0].toLowerCase().slice(0, 80)

    // Any non-function term (POS-filtered, not a word list)
    const content = doc
      .not("#Preposition").not("#Conjunction").not("#Auxiliary")
      .not("#Modal").not("#Determiner").not("#QuestionWord").not("#Pronoun")
      .terms()
      .out("array") as string[]
    if (content.length > 0) return content[0].toLowerCase().slice(0, 80)
  } catch { /* compromise parse failure */ }

  return title.toLowerCase().slice(0, 80)
}

export async function POST(req: NextRequest) {
  let query: string
  let context: string
  let lastPassage: string
  try {
    const body = await req.json()
    query       = typeof body?.query       === "string" ? body.query.trim()       : ""
    context     = typeof body?.context     === "string" ? body.context.trim()     : ""
    lastPassage = typeof body?.lastPassage === "string" ? body.lastPassage.trim() : ""
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 })
  }

  if (!query || query.length < 1) {
    return NextResponse.json({ error: "query too short" }, { status: 400 })
  }
  if (query.length > 500) {
    return NextResponse.json({ error: "query too long" }, { status: 400 })
  }

  // ── Topic-change detection ──────────────────────────────────────────────────
  // If the query contains anaphoric references (pronouns, "that" before a verb)
  // it is almost certainly a same-topic follow-up — skip NER.
  // Otherwise, run NER + similarity in parallel to detect topic switches.
  let resolved: string
  let isNewTopic: boolean

  const cleanedQuery = stripFiller(query)
  const hasRef = hasAnaphoricReference(cleanedQuery)

  if (!hasRef && context) {
    // No pronouns → might be a new topic. Check semantically.
    const topicResult = await detectTopicChange(cleanedQuery, context, lastPassage)
    if (topicResult.isNewTopic) {
      // User switched topics. Don't inject old context.
      // The new entity (if detected) becomes the next context via entityFromResult below.
      resolved = cleanedQuery
      isNewTopic = true
      // Override context so stability rule uses the new entity if NER found one
      if (topicResult.newEntity) context = topicResult.newEntity
    } else {
      const r = resolveQuery(query, context)
      resolved = r.resolved
      isNewTopic = r.isNewTopic
    }
  } else {
    // Has pronouns → same-topic follow-up, apply pronoun resolution
    const r = resolveQuery(query, context)
    resolved = r.resolved
    isNewTopic = r.isNewTopic
  }

  const result = await retrieveBestPassage(resolved)

  // Entity tracking: what we FOUND is always more authoritative than what we asked for.
  // The result URL/title/passage tells us definitively what was retrieved — the query
  // may contain leading filler ("k so", "lmaooo ok") that corrupts query-based extraction.
  // Query-based extraction is only used as a fallback when the result is null.
  const queryBasedEntity = extractEntity(resolved)

  let nextContext = result
    ? (entityFromResult(result, resolved, context) || queryBasedEntity || context)
    : context

  // Context stability: keep old context when either:
  //   a) New entity doesn't appear in resolved query (it came from a noisy title)
  //   b) BOTH old and new entities appear in resolved query — the old one was
  //      explicitly injected via pronoun resolution, making it more authoritative
  //      than an accidentally-included sub-phrase (e.g. "hole slower" vs "black hole")
  if (context && nextContext !== context && !isNewTopic) {
    const resolvedLower   = resolved.toLowerCase()
    const oldInResolved   = resolvedLower.includes(context.toLowerCase())
    const newInResolved   = resolvedLower.includes(nextContext.toLowerCase())
    if (!newInResolved || (oldInResolved && newInResolved)) {
      nextContext = context
    }
  }

  if (!result) {
    return NextResponse.json({
      passage: null, url: null, title: null,
      resolvedQuery: resolved,
      nextContext,
      lastPassage: "",
    }, { status: 200 })
  }

  return NextResponse.json({
    passage:    result.passage,
    url:        result.url,
    title:      result.title,
    score:      result.score,
    resolvedQuery: resolved,
    nextContext,
    lastPassage: result.passage,   // client stores this and sends on next turn
  })
}
