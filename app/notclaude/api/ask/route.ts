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
 * "Who X" queries need special handling: the query title says "who discovered evolution?"
 * (topic = evolution) but the right entity for the NEXT turn's context is the PERSON
 * who answered that question ("Charles Darwin"). The answer is in the passage, not the title.
 * For all other query types, URL → title → passage → query priority works well.
 */
function entityFromResult(
  result: { url: string; title: string; passage: string } | null,
  resolvedQuery: string,
  fallback: string
): string {
  if (result) {
    // ── 1. Wikipedia URL slug — most reliable, always check first ────────────
    // The Wikipedia URL slug IS the canonical entity name, normalized and clean.
    // e.g. /wiki/Marie_Curie → "marie curie" (correct, regardless of passage text)
    try {
      const u = new URL(result.url)
      if (u.hostname.includes("wikipedia.org")) {
        const slug = decodeURIComponent(u.pathname.replace(/^\/wiki\//, ""))
          .replace(/_/g, " ").trim()
        if (slug && slug.length < 80 && !slug.includes("/")) return slug.toLowerCase()
      }
    } catch { /* ignore */ }

    // ── "Who X" queries: passage person name (non-Wikipedia sources) ─────────
    // For "who is/was/did X", the entity is the person the passage names.
    // Only used when Wikipedia URL isn't available (non-Wikipedia sources).
    if (/^who\b/i.test(resolvedQuery.trim())) {
      const pm = result.passage.match(/\b([A-Z][a-z]{1,20}\s+[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,15})?)\b/)
      if (pm?.[1]) return pm[1].toLowerCase()
    }

    // ── 2. Title → NLP entity extraction (no stop-word list) ─────────────────
    if (result.title) {
      const entity = entityFromTitleNLP(result.title)
      if (entity && entity.length >= 2) return entity
    }

    // ── 3. First proper-noun pair in passage ──────────────────────────────────
    const m = result.passage.match(
      /\b([A-Z][a-z]{1,20}\s+[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,15})?)\b/
    )
    if (m?.[1]) return m[1].toLowerCase()
  }

  // ── 4. Query-based NLP extraction ─────────────────────────────────────────
  return extractEntity(resolvedQuery) || fallback
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
