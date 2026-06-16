import { NextRequest, NextResponse } from "next/server"
import { retrieveBestPassage } from "../../engine/retrieve"
import { resolveQuery, extractEntity } from "../../engine/resolve"

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
    // ── "Who X" queries: answer is a PERSON — check passage first ────────────
    // For "who is/was/did X", the entity we want going forward is the person
    // the passage names. Title says "Who discovered evolution?" → "evolution";
    // passage says "Charles Darwin is commonly cited" → "charles darwin". Passage wins.
    if (/^who\b/i.test(resolvedQuery.trim())) {
      const pm = result.passage.match(/\b([A-Z][a-z]{1,20}\s+[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,15})?)\b/)
      if (pm?.[1]) return pm[1].toLowerCase()
    }

    // ── 1. Wikipedia URL slug ────────────────────────────────────────────────
    try {
      const u = new URL(result.url)
      if (u.hostname.includes("wikipedia.org")) {
        const slug = decodeURIComponent(u.pathname.replace(/^\/wiki\//, ""))
          .replace(/_/g, " ").trim()
        if (slug && slug.length < 80 && !slug.includes("/")) return slug.toLowerCase()
      }
    } catch { /* ignore */ }

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

    // Named entities / topics first (most precise: "Marie Curie", "Coriolis effect")
    const topics = doc.topics().out("array") as string[]
    if (topics.length > 0) return topics[0].toLowerCase().slice(0, 80)

    // Proper nouns
    const proper = doc.match("#ProperNoun+").out("array") as string[]
    if (proper.length > 0) return proper[0].toLowerCase().slice(0, 80)

    // Content nouns (filter function words by POS, not by word list)
    const nouns = doc.nouns().not("#Pronoun").out("array") as string[]
    if (nouns.length > 0) {
      // Take last 2 nouns (often the topic rather than the predicate)
      const last = nouns.slice(-2).join(" ").toLowerCase()
      if (last.length >= 2) return last.slice(0, 80)
    }

    // Any non-function term (POS-filtered, not a word list)
    const content = doc
      .not("#Preposition").not("#Conjunction").not("#Auxiliary")
      .not("#Modal").not("#Determiner").not("#QuestionWord").not("#Pronoun")
      .terms()
      .out("array") as string[]
    if (content.length > 0) return content.slice(-2).join(" ").toLowerCase().slice(0, 80)
  } catch { /* compromise parse failure */ }

  return title.toLowerCase().slice(0, 80)
}

export async function POST(req: NextRequest) {
  let query: string
  let context: string
  try {
    const body = await req.json()
    query   = typeof body?.query   === "string" ? body.query.trim()   : ""
    context = typeof body?.context === "string" ? body.context.trim() : ""
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 })
  }

  if (!query || query.length < 1) {
    return NextResponse.json({ error: "query too short" }, { status: 400 })
  }
  if (query.length > 500) {
    return NextResponse.json({ error: "query too long" }, { status: 400 })
  }

  const { resolved, isNewTopic } = resolveQuery(query, context)
  const result = await retrieveBestPassage(resolved)

  // Prefer query-based entity when it appears in the resolved query
  // (the query explicitly names the topic → more reliable than title parsing).
  const queryBasedEntity = extractEntity(resolved)
  const queryEntityInResolved = Boolean(
    queryBasedEntity && resolved.toLowerCase().includes(queryBasedEntity.toLowerCase())
  )

  let nextContext = result
    ? (queryEntityInResolved ? queryBasedEntity : entityFromResult(result, resolved, context))
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
    }, { status: 200 })
  }

  return NextResponse.json({
    passage: result.passage,
    url:     result.url,
    title:   result.title,
    score:   result.score,
    resolvedQuery: resolved,
    nextContext,
  })
}
