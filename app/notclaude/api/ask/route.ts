import { NextRequest, NextResponse } from "next/server"
import { retrieveBestPassage } from "../../engine/retrieve"
import { resolveQuery, extractEntity } from "../../engine/resolve"

/**
 * Extract the best entity string from a successful response.
 * Prefers URL-based (most stable), then title-based, then query-based.
 */
function entityFromResult(
  result: { url: string; title: string; passage: string } | null,
  resolvedQuery: string,
  fallback: string
): string {
  if (result) {
    // Wikipedia URL: /wiki/Article_Name → cleanest entity
    try {
      const u = new URL(result.url)
      if (u.hostname.includes("wikipedia.org")) {
        const slug = decodeURIComponent(u.pathname.replace(/^\/wiki\//, ""))
          .replace(/_/g, " ").trim()
        if (slug && slug.length < 80 && !slug.includes("/")) return slug.toLowerCase()
      }
    } catch { /* ignore */ }

    // Page title: "Article Title - Site Name" → extract the core topic noun(s).
    // Order matters: strip prefixes BEFORE subtitle separators, so "Video: Entropy"
    // becomes "Entropy" not "Video".
    if (result.title) {
      let t = result.title
        // 1. Strip known site name suffixes: "Title | Wikipedia"
        .replace(/\s*[-–|]\s*(?:Wikipedia|NASA|Britannica|BBC|CNN|Reuters|AP|NPR|PBS|NIH|DOE|Mayo Clinic|Cleveland Clinic|WebMD|Reddit|Quora|YouTube|Medium|TikTok|Twitter|X\.com|Study\.com|Cloudflare|HowToGeek|Merriam-Webster|Science Museum|Science\s*\+\s*Media|Harvard|MIT|Stanford|Oxford|Cambridge)[^|–\-]*/gi, "")
        // 2. Strip generic " | Anything" suffixes
        .replace(/\s*[|]\s*.{2,80}$/, "")
        // 3. Strip article-type prefixes FIRST: "Video: X" → "X", "Guide: X" → "X"
        .replace(/^(?:Video|Article|Guide|Tutorial|Lesson|Watch|Read|Learn|Photo|Review|Explainer|Podcast|Webinar)\s*[:–-]\s*/gi, "")
        // 4. Strip story/editorial prefixes: "Celebrating X", "A Brief History of X"
        .replace(/^(?:celebrating|understanding|exploring|introducing|everything\s+(?:about|you\s+need)|all\s+about|the\s+(?:truth\s+about|story\s+of|science\s+of))\s+/gi, "")
        .replace(/^(?:a\s+(?:brief\s+)?(?:short\s+)?|the\s+)?(?:history|story|introduction|guide|overview|explanation|definition|meaning)\s+(?:of|to|about)\s+/gi, "")
        // 5. Strip question-word prefixes: "What is X" → "X"
        .replace(/^(?:What\s+is|What\s+are|Who\s+is|Who\s+was|How\s+does|How\s+do|Why\s+does|Why\s+did|When\s+was|Where\s+is)\s+/gi, "")
        // 6. Now strip subtitle separators: "Entropy: Lesson for Kids" → "Entropy"
        .replace(/\s*[-–:]\s*.{3,80}$/, "")
        // 7. Strip trailing articles and punctuation
        .replace(/^(?:a|an|the)\s+/i, "")
        .replace(/[?!.,]+$/, "")
        .trim()
        .toLowerCase()

      // 8. Take at most 2 meaningful words to prevent noise like "what would happen black hole"
      //    Include question words, auxiliaries, pronouns, and common title words as stops
      const TITLE_STOPS = new Set([
        // Articles/prepositions
        "a", "an", "the", "of", "in", "on", "at", "for", "to", "and", "or", "by", "with", "from", "into", "upon", "over", "under", "between", "through",
        // Copulas/auxiliaries
        "is", "are", "was", "were", "be", "been", "being", "do", "does", "did", "has", "have", "had", "will", "would", "could", "should", "can", "may", "might", "must", "shall",
        // Question words / topic-change words
        "what", "who", "why", "how", "when", "where", "which", "that", "if", "whether",
        // Pronouns
        "you", "i", "we", "they", "it", "this", "those", "these", "he", "she", "me", "him", "her", "us", "them",
        // Common verb forms that don't identify the topic
        "happen", "happens", "happened", "fall", "fell", "fallen", "fell", "makes", "make", "made", "gets", "get", "got",
        "discovered", "invented", "created", "found", "found", "work", "works", "worked",
        // Title noise words
        "about", "about", "its", "their", "our", "your", "his",
        "kids", "children", "beginners", "students", "people", "everyone",
        "explained", "explanation", "video", "lesson", "tutorial", "guide", "article", "book", "post", "blog",
        // Common quantifiers
        "many", "most", "some", "any", "all", "every", "each", "both", "few", "more", "less",
        // Common adjectives that don't identify the topic
        "brief", "short", "long", "simple", "basic", "advanced", "complete", "full", "real", "true", "new", "old",
      ])
      const words = t.split(/\s+/).filter(w => w.length > 1 && !TITLE_STOPS.has(w.toLowerCase()))
      const capped = words.slice(0, 2).join(" ")
      if (capped.length >= 2 && capped.length <= 60) return capped
    }

    // Passage: first proper noun pair (e.g. "Charles Darwin", "Marie Curie")
    const m = result.passage.match(/\b([A-Z][a-z]{1,20}\s+[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,15})?)\b/)
    if (m?.[1] && m[1] !== result.passage.slice(0, m[1].length)) {
      return m[1].toLowerCase()
    }
  }

  // Last resort: extract from the resolved query
  const qe = extractEntity(resolvedQuery)
  return qe || fallback
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

  // Prefer query-based entity when it actually appears in the resolved query —
  // titles can be misleading ("A Look Back at Why Blockbuster Failed" → "look back"
  // instead of "blockbuster"). But if the extracted entity isn't in the query,
  // the query-based extraction is also wrong → fall back to title/URL.
  const queryBasedEntity = extractEntity(resolved)
  const queryEntityInResolved = Boolean(
    queryBasedEntity && resolved.toLowerCase().includes(queryBasedEntity.toLowerCase())
  )

  let nextContext = result
    ? (queryEntityInResolved ? queryBasedEntity : entityFromResult(result, resolved, context))
    : context  // on miss, keep current context — user might rephrase

  // Context stability: if the new entity doesn't appear anywhere in the resolved
  // query, the title/URL extraction grabbed something irrelevant (e.g. Reddit
  // "person stuck" when the topic is "black hole"). In that case, keep old context.
  // e.g. resolved "is black hole slower" → entity "black hole" ✓ (appears in query)
  //      resolved "is black hole slower" → entity "person stuck" ✗ (NOT in query) → keep "black hole"
  if (context && nextContext !== context && !isNewTopic) {
    if (!resolved.toLowerCase().includes(nextContext.toLowerCase())) {
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

