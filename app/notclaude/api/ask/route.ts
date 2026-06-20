import { NextRequest, NextResponse } from "next/server"
import { retrieveBestPassage } from "../../engine/retrieve"
import { resolveQuery, extractEntity, stripFiller, hasAnaphoricReference } from "../../engine/resolve"
import { detectTopicChange } from "../../engine/topicDetect"

// ── Phatic (greeting) detection via local sentence embeddings ─────────────────
// Uses @xenova/transformers (already in project) to run inference locally —
// no API key, no network call after first model load, no cold start issues.
//
// Dialogue act research (ISO 24617-2, Jurafsky 1997) defines greetings as a
// closed functional class. Embedding similarity against phatic exemplars
// captures this without a word list: greetings cluster tightly in the
// sentence-transformer embedding space.
//
// Model: Xenova/all-MiniLM-L6-v2 (~22MB, CPU-only, quantized int8)
// Exemplars are cached after first computation; model is a singleton per process.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _extractor: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _exemplarEmbeds: number[][] | null = null

const PHATIC_EXEMPLARS = [
  "hey", "hi", "hello", "yo", "sup",
  "good morning", "good evening", "good night", "good afternoon",
  "what's up", "how are you", "you there",
  "thanks bye", "bye", "goodbye", "see you later", "take care",
  // Social closings — not a word list, but semantic seeds for the bi-encoder.
  // The model generalizes to "thnaks im gud" via embedding proximity, not exact match.
  "ok thanks", "im good", "alright thanks", "all good", "im all good",
  "ok im done", "that's all", "nothing else", "i'm good now",
]

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-8)
}

async function checkPhaticSimilarity(query: string): Promise<number> {
  try {
    // Lazy-load the model singleton — loads once per process, stays in memory
    if (!_extractor) {
      const { pipeline } = await import("@xenova/transformers")
      _extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
        quantized: true,
      })
    }

    // Pre-compute exemplar embeddings once and cache them
    if (!_exemplarEmbeds) {
      const raw = await _extractor(PHATIC_EXEMPLARS, { pooling: "mean", normalize: true })
      _exemplarEmbeds = raw.tolist() as number[][]
    }

    // Embed the query
    const qRaw = await _extractor([query], { pooling: "mean", normalize: true })
    const qVec = new Float32Array(qRaw.tolist()[0] as number[])

    // Return max cosine similarity against phatic exemplars
    let maxSim = -1
    for (const exemplarVec of _exemplarEmbeds) {
      const sim = cosineSimilarity(qVec, new Float32Array(exemplarVec))
      if (sim > maxSim) maxSim = sim
    }
    return maxSim
  } catch {
    return 0
  }
}

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
  // Split into sentences and skip short exclamatory openers ("Nothing!", "Yes,", "Sure!")
  // that are not entity-defining sentences — try up to 3 sentences.
  const sentences = cleaned.split(/(?<=[.!?])\s+/)
  const candidates = sentences.filter(s => s.trim().split(/\s+/).length >= 4).slice(0, 3)
  const firstSentence = candidates[0] || sentences[0] || cleaned

  const doc = nlpLib(firstSentence)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const terms: Array<{ text: string; tags: string[] }> = (doc as any).json()[0]?.terms ?? []

  // Find first copula — separates subject from predicate
  const copulaIdx = terms.findIndex(t => t.tags?.includes("Copula"))
  if (copulaIdx > 0) {
    const subjectTerms = terms
      .slice(0, copulaIdx)
      .filter(t => !t.tags?.includes("Determiner") && !t.tags?.includes("QuestionWord"))

    // Strip parenthetical expansions: "DNA (Deoxyribonucleic Acid)" → use only "DNA".
    const parenStart = subjectTerms.findIndex(t => t.text === "(")
    const coreTerms = parenStart > 0 ? subjectTerms.slice(0, parenStart) : subjectTerms

    const hasTg = (t: { tags: string[] }, tag: string) => Array.isArray(t.tags) && t.tags.includes(tag)

    // Extract compound noun phrase: collect ALL consecutive Adjective/Noun/ProperNoun/Abbreviation
    // terms until hitting a non-content word (Conjunction, Preposition, Verb, etc.).
    // "dark energy" → [Adj, Noun] → "dark energy"
    // "ocean acidification" → [Noun, Noun] → "ocean acidification"
    // "primary cause of X" → [Adj, Noun] stops before "of" (Preposition) → "primary cause"
    // "tariff or duty" → [Noun] stops before "or" (Conjunction) → "tariff"
    let compoundEnd = 0
    while (compoundEnd < coreTerms.length) {
      const t = coreTerms[compoundEnd]
      const isContent = (t.tags?.includes("Noun") || t.tags?.includes("Adjective") ||
                         t.tags?.includes("ProperNoun") || t.tags?.includes("Abbreviation")) &&
                        !t.tags?.includes("Conjunction") && !t.tags?.includes("Determiner") &&
                        !t.tags?.includes("Pronoun") && !t.tags?.includes("Preposition")
      if (isContent) { compoundEnd++; continue }
      break
    }
    const subjectTerms2 = compoundEnd > 0 ? coreTerms.slice(0, compoundEnd) : coreTerms

    // Reject if subject contains a main Verb — indicates a subordinate clause, not a topic name.
    const hasMainVerb = subjectTerms2.some(t =>
      hasTg(t, "Verb") && !hasTg(t, "Auxiliary") && !hasTg(t, "Modal") && !hasTg(t, "Copula")
    )
    if (!hasMainVerb) {
      // "X of Y is Z" pattern: if compound is followed by Preposition "of",
      // the actual topic is Y (the object of "of"), not X.
      // "The primary cause of ocean acidification is..." → entity = "ocean acidification"
      // English genitive construction: relational noun + "of" + topic noun.
      const nextAfterCompound = coreTerms[compoundEnd]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (nextAfterCompound && hasTg(nextAfterCompound, "Preposition") && (nextAfterCompound as any)?.normal?.toLowerCase() === "of") {
        const ofPhrase = coreTerms.slice(compoundEnd + 1)
        let ofEnd = 0
        while (ofEnd < ofPhrase.length) {
          const t = ofPhrase[ofEnd]
          const isContent = (t.tags?.includes("Noun") || t.tags?.includes("Adjective") ||
                             t.tags?.includes("ProperNoun")) &&
                            !t.tags?.includes("Conjunction") && !t.tags?.includes("Determiner") &&
                            !t.tags?.includes("Pronoun") && !t.tags?.includes("Preposition")
          if (isContent) { ofEnd++; continue }
          break
        }
        if (ofEnd > 0) {
          const ofSubject = ofPhrase.slice(0, ofEnd).map(t => t.text).join(" ").trim().toLowerCase()
          if (ofSubject.length >= 3 && ofSubject.length <= 50) return ofSubject
        }
      }
      const subject = subjectTerms2.map(t => t.text).join(" ").trim().toLowerCase()
      if (subject.length >= 2 && subject.length <= 60) return subject
    }
  }

  // Fallback: first content term starting with uppercase (named entity not in lexicon).
  // Skip Determiners ("The", "A"), function words, and negation words ("Nothing", "Nobody")
  // which appear in exclamatory sentences and are not entity names.
  for (const term of terms) {
    if (!term.text || !/^[A-Z]/.test(term.text) || term.text === "I") continue
    if (term.tags?.includes("Determiner") || term.tags?.includes("Conjunction") ||
        term.tags?.includes("Preposition") || term.tags?.includes("QuestionWord") ||
        term.tags?.includes("Negative") || term.tags?.includes("Expression") ||
        term.tags?.includes("Interjection")) continue
    const cleaned2 = term.text.replace(/[^a-zA-Z0-9 ]/g, "").toLowerCase().trim()
    if (cleaned2.length >= 3) return cleaned2
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

    // Named entities / topics first (most precise).
    // Filter out Honorific-tagged results: "Rev" = Reverend, "Dr" = Doctor, etc.
    // compromise tags these as Abbreviation+Honorific+ProperNoun, so a verb like
    // "rev" in "cars rev higher" gets misidentified as a person-title.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allTopics = doc.topics().out("array") as string[]
    const topics = allTopics.filter(t => {
      const tTerms = (nlpLib(t) as any).json()[0]?.terms ?? []
      return !tTerms.some((term: { tags?: string[] }) => term.tags?.includes("Honorific"))
    })
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
    // Skip noun phrases containing embedded Verbs OR Honorific abbreviations.
    // "cars rev higher" contains "rev" (Honorific=Reverend) — skip it.
    const nouns = doc.nouns().not("#Pronoun").out("array") as string[]
    for (const noun of nouns) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nTerms: Array<{ tags: string[] }> = (nlpLib(noun) as any).json()[0]?.terms ?? []
      const hasPureVerb = nTerms.some(t => t.tags?.includes("Verb") && !t.tags?.includes("Noun"))
      const hasHonorific = nTerms.some(t => t.tags?.includes("Honorific"))
      if (!hasPureVerb && !hasHonorific) {
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

  // ── Filler stripping + phatic detection ────────────────────────────────────
  const cleanedQuery = stripFiller(query)

  // Pure phatic/greeting ("yo", "hey", "sup") — nothing left after stripping.
  // Return null without searching; don't update context.
  if (!cleanedQuery) {
    return NextResponse.json({
      passage: null, deflection: "greeting", url: null, title: null,
      resolvedQuery: query,
      nextContext: context,
      lastPassage: "",
    }, { status: 200 })
  }

  // ── Bi-encoder phatic detection (multi-word greetings) ─────────────────────
  // Single-word greetings ("yo") are caught above by the Expression POS tag.
  // Multi-word greetings ("good morning", "thanks bye", "you there", "what's up")
  // survive filler stripping — they have real POS content but zero search intent.
  //
  // Approach: compare query against canonical phatic exemplars using the same
  // sentence-transformer model already used in topicDetect.ts. No word list.
  // Dialogue act research (ISO 24617-2, Jurafsky et al.) defines greetings as a
  // closed functional class; embedding similarity against exemplars captures it.
  //
  // Only runs for short queries (≤ 4 tokens) to avoid latency on content queries.
  const queryWords = cleanedQuery.trim().split(/\s+/)
  if (queryWords.length <= 4) {
    const phaticScore = await checkPhaticSimilarity(cleanedQuery)
    if (phaticScore >= 0.70) {
      return NextResponse.json({
        passage: null, deflection: "greeting", url: null, title: null,
        resolvedQuery: query,
        nextContext: context,
        lastPassage: "",
      }, { status: 200 })
    }
  }

  // ── Four-field context state ───────────────────────────────────────────────────
  // Context is encoded as "entity|aspect|subject|confidence" (pipe-separated).
  //   entity     — the current topic (e.g., "stock market")
  //   aspect     — temporal/sub-topic qualifier (e.g., "2008")
  //   subject    — grammatical subject from "what about X" (e.g., "algae")
  //   confidence — float 0–1: how confident we are the entity is correct
  //
  // Research basis: TREC CAsT (2019–2021) and QuAC literature shows that confidently
  // propagating a wrong context entity ("wild blue light") is worse than failing
  // gracefully. Systems that gate on confidence produce fewer cascading failures.
  // When confidence < 0.3, pronouns are left unresolved rather than resolved to stale
  // context — a vague response beats 6 poisoned turns.
  const ctxParts = context.split("|")
  const ctxEntity     = ctxParts[0] || ""
  const ctxAspect     = ctxParts[1] || ""
  const ctxSubject    = ctxParts[2] || ""
  const ctxConfidence = parseFloat(ctxParts[3] || "1")

  // Pronoun resolution is gated on confidence:
  // - High confidence (≥ 0.3): inject context as normal
  // - Low confidence (< 0.3): don't inject — leave pronouns unresolved
  //   A null response beats propagating corrupted context.
  const resolveCtx = ctxConfidence >= 0.3
    ? (ctxSubject || (ctxAspect ? `${ctxAspect} ${ctxEntity}` : ctxEntity))
    : ""

  // ── Topic-change detection ──────────────────────────────────────────────────
  let resolved: string
  let isNewTopic: boolean
  let newSubjectFromQuery = ""

  // Save prior context (entity only) before it may be mutated by topic-change detection.
  const priorContext = ctxEntity

  const hasRef = hasAnaphoricReference(cleanedQuery)

  // Confidence-gated pronoun resolution: if context confidence is too low (<0.3),
  // don't attempt to resolve pronouns — we don't know what they refer to.
  // Return null (deflection "miss") rather than propagating stale context.
  // Research: TREC CAsT literature calls this "error propagation prevention" —
  // a confident wrong answer is worse than an honest null.
  if (hasRef && resolveCtx === "" && ctxConfidence < 0.3) {
    return NextResponse.json({
      passage: null, deflection: "miss", url: null, title: null,
      resolvedQuery: query,
      nextContext: context, // preserve whatever confidence state exists
      lastPassage: "",
    }, { status: 200 })
  }

  // Bare question word (+ optional Adverb) queries structurally cannot introduce
  // new topics — "when exactly", "where precisely", "why" are always follow-ups.
  // Skip detectTopicChange entirely: isBareQuestionWord handles them in resolveQuery.
  // POS-based: QuestionWord tag + all other tokens Adverb tag. No word list.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cleanedTerms: Array<{tags?: string[]; text?: string}> = (nlpLib(cleanedQuery) as any).json()[0]?.terms ?? []
  const isBareFollowUp = cleanedTerms.length >= 1 && cleanedTerms.length <= 2 &&
    cleanedTerms.some(t => t.tags?.includes("QuestionWord")) &&
    cleanedTerms.every(t => t.tags?.includes("QuestionWord") || t.tags?.includes("Adverb") ||
                            (t.text ?? "").match(/^[?!.,]+$/) !== null)

  let nerEntityInQuery: string | null = null

  if (!hasRef && ctxEntity && !isBareFollowUp) {
    const topicResult = await detectTopicChange(cleanedQuery, ctxEntity, lastPassage)
    nerEntityInQuery = topicResult.isNewTopic ? (topicResult.newEntity ?? null) : null
    if (topicResult.isNewTopic) {
      if (topicResult.newEntity) {
        const qWords = cleanedQuery.trim().split(/\s+/)
        const firstQW = qWords[0]?.toLowerCase()
        const QUESTION_EXPANSIONS: Record<string, string> = {
          when: "when was", where: "where is", why: "why did",
          who: "who is", how: "how does",
        }
        resolved = firstQW && QUESTION_EXPANSIONS[firstQW]
          ? `${QUESTION_EXPANSIONS[firstQW]} ${topicResult.newEntity}`
          : `what is ${topicResult.newEntity}`
      } else {
        resolved = cleanedQuery
      }
      isNewTopic = true
      if (topicResult.newEntity) context = topicResult.newEntity
    } else {
      const r = resolveQuery(query, resolveCtx)
      resolved = r.resolved
      isNewTopic = r.isNewTopic
      newSubjectFromQuery = r.newSubject || ""
    }
  } else {
    const r = resolveQuery(query, resolveCtx)
    resolved = r.resolved
    isNewTopic = r.isNewTopic
    newSubjectFromQuery = r.newSubject || ""
  }

  // ── Query enrichment ─────────────────────────────────────────────────────────
  // Enrich short, ambiguous queries (≤ 1 rich content word by POS) with prior context.
  // "goosebumps", "when", "we cooked" lack enough specificity to stand alone.
  // Queries with ProperNoun/Value/Cardinal are already specific — don't add noise.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resolvedTerms: Array<{ tags: string[]; text: string }> = (nlpLib(resolved) as any).json()[0]?.terms ?? []
  const richCount = resolvedTerms.filter((t: { tags: string[] }) =>
    (t.tags?.includes("Noun") || t.tags?.includes("Adjective") || t.tags?.includes("ProperNoun")) &&
    !t.tags?.includes("Pronoun") && !t.tags?.includes("Determiner")
  ).length
  const hasSpecificRef = resolvedTerms.some((t: { tags: string[] }) =>
    t.tags?.includes("ProperNoun") || t.tags?.includes("Value") || t.tags?.includes("Cardinal")
  )
  // Only enrich same-topic follow-ups. New-topic queries (topic switch detected by NER/similarity)
  // should search directly — adding old-context terms to a new topic corrupts the search.
  // For same-topic short/generic queries ("when", "what is the difference", "we cooked"),
  // prior context makes them meaningful.
  const shouldEnrich = richCount <= 1 && !hasSpecificRef && priorContext !== "" && !isNewTopic

  // Enrich: append prior context entity directly to resolved (and therefore to the search).
  // Updating resolved (not a hidden searchQuery) means resolvedQuery in the response
  // reflects the actual search intent — "we getting screwed tariff", "when was crispr", etc.
  // Use priorContext only (not passage nouns) — passage nouns cause contamination when
  // the prior passage was itself a non-standard result.
  let didEnrich = false
  if (shouldEnrich && priorContext) {
    if (!resolved.toLowerCase().includes(priorContext.toLowerCase())) {
      resolved = resolved + " " + priorContext
      didEnrich = true
    }
  }

  const result = await retrieveBestPassage(resolved)

  // Post-search phatic detection: if a single-content-word query returns a very low-confidence
  // result, it was likely a greeting or noise misinterpreted as a search term.
  // "sup" → paddle board article (weak lexical match, low score) → return null.
  // This is model-based (bi-encoder confidence), not a word list.
  // Post-search phatic detection: very low bi-encoder score on a short query
  // means the result is weakly matched — likely a greeting or social closing.
  // Applies regardless of whether prior context exists: "ok thanks" mid-conversation
  // should also return null. Score threshold 0.35 is calibrated to catch phatic queries
  // that survive filler stripping (structural POS missed them) without false-positives
  // on content queries (which score 0.6+).
  if (result && richCount <= 1 && (result.score ?? 1) < 0.35) {
    return NextResponse.json({
      passage: null, deflection: "greeting", url: null, title: null,
      resolvedQuery: query, nextContext: context, lastPassage: "",
    }, { status: 200 })
  }

  // ── Fix 2: Query-biased entity tracking (factoid vs definition) ───────────────
  // Research: Chatterjee & Dietz (ICTIR 2019) — oracle entity selection from passages
  // covers only 19.7% of relevant documents. Passage entity extraction is unreliable
  // for factoid answers ("how many albums has she made" → passage entity = "albums").
  //
  // Solution: distinguish query types by POS structure.
  // DEFINITION query (what is X, who is X): passage introduces the new entity → passage wins.
  // FACTOID query (how many, when did, does X, etc.): passage ANSWERS about the current
  //   entity → query entity or existing context wins.
  //
  // POS check: QuestionWord + Copula at start = definition. Everything else = factoid.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resolvedTermsForType: Array<{tags?: string[]}> = (nlpLib(resolved) as any).json()[0]?.terms ?? []
  const isDefinitionQuery = resolvedTermsForType.length >= 2 &&
    resolvedTermsForType[0]?.tags?.includes("QuestionWord") &&
    (resolvedTermsForType[1]?.tags?.includes("Copula") ||
     resolvedTermsForType[1]?.tags?.includes("Auxiliary"))

  const queryBasedEntity = extractEntity(resolved)
  const resultEntity = result
    ? (entityFromResult(result, resolved, ctxEntity) || "")
    : ""

  let nextEntity: string
  if (isDefinitionQuery) {
    // "what is bitcoin" → the passage defines the new topic → passage entity wins
    if (!resultEntity) {
      nextEntity = queryBasedEntity || ctxEntity
    } else if (queryBasedEntity && queryBasedEntity.split(" ").length > resultEntity.split(" ").length) {
      nextEntity = queryBasedEntity
    } else {
      nextEntity = resultEntity || queryBasedEntity || ctxEntity
    }
  } else {
    // Factoid query: "how many albums has she made", "when did X happen", etc.
    // The passage ANSWERS about the entity — don't let answer content replace topic.
    //
    // Two cases:
    // (a) Pronoun resolved to the SAME entity as context: "how many albums has
    //     TAYLOR SWIFT made" (she → taylor swift, ctxEntity = taylor swift)
    //     → entity stays, we're asking about the same thing.
    // (b) Pronoun resolved to a DIFFERENT entity via subject shift: after "what about
    //     stocks" (subject=stocks), "did THEY do well" (they=stocks, ctxEntity=compound
    //     interest) → entity should update to stocks.
    //
    // Signal: if resolveCtx ≠ ctxEntity, we resolved to a different entity.
    const resolvedToDifferentEntity = resolveCtx && ctxEntity &&
      !resolveCtx.toLowerCase().includes(ctxEntity.toLowerCase()) &&
      !ctxEntity.toLowerCase().includes(resolveCtx.toLowerCase())
    // Also switch entity when the query directly names a NEW entity without any pronoun
    // binding forcing the old one. "how much does Samsung Galaxy S24 cost" after iPhone
    // context: no pronoun ties us to iPhone, queryBasedEntity = "samsung galaxy s24",
    // which clearly differs from ctxEntity "iphone 15" → update to Samsung.
    const queryNamesNewEntity = !hasRef && queryBasedEntity && ctxEntity &&
      !queryBasedEntity.toLowerCase().includes(ctxEntity.toLowerCase()) &&
      !ctxEntity.toLowerCase().includes(queryBasedEntity.toLowerCase())
    nextEntity = (resolvedToDifferentEntity || queryNamesNewEntity)
      ? (queryBasedEntity || resolveCtx || ctxEntity)
      : (ctxEntity || queryBasedEntity)
  }

  // Strip leading question-word + copula from entity names.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ncTerms: Array<{ text: string; tags: string[] }> = (nlpLib(nextEntity) as any).json()[0]?.terms ?? []
  let entityStart = 0
  while (
    entityStart < ncTerms.length &&
    (ncTerms[entityStart].tags?.includes("QuestionWord") ||
     ncTerms[entityStart].tags?.includes("Copula") ||
     (entityStart === 0 && ncTerms[entityStart].tags?.includes("Determiner")))
  ) { entityStart++ }
  if (entityStart > 0 && entityStart < ncTerms.length) {
    nextEntity = ncTerms.slice(entityStart).map(t => t.text).join(" ").trim().toLowerCase()
  }

  // Confidence gate
  const CONFIDENCE_THRESHOLD = 0.4
  if (result && (result.score ?? 1) < CONFIDENCE_THRESHOLD && !isNewTopic) {
    nextEntity = queryBasedEntity || ctxEntity
  }

  // Context stability — uses entity part only (not pipe-encoded full string)
  if (ctxEntity && nextEntity !== ctxEntity) {
    const resolvedLower = resolved.toLowerCase()
    const sigWords = (e: string) => e.toLowerCase().split(/\s+/).filter(w => w.length >= 4)
    const newWords = sigWords(nextEntity)
    if (newWords.length > 0) {
      const oldWords = sigWords(ctxEntity)
      // Use prefix/root matching to handle morphological variants:
      // "yawning" should match "yawn" in the resolved query (same root).
      const resolvedWords = resolvedLower.split(/\s+/).filter(rw => rw.length >= 4)
      const newInResolved = newWords.every(w =>
        resolvedLower.includes(w) ||
        resolvedWords.some(rw => w.startsWith(rw) || rw.startsWith(w))
      )
      const oldInResolved = !didEnrich && oldWords.length > 0 && oldWords.some(w => resolvedLower.includes(w))
      if (!newInResolved || (oldInResolved && newInResolved)) {
        nextEntity = ctxEntity
      }
    }
  }

  // ── Aspect extraction (temporal qualifier) ──────────────────────────────────
  const yearMatch = resolved.match(/\b(1[5-9][0-9]{2}|20[0-2][0-9])\b/)
  const nextAspect = yearMatch ? yearMatch[1] : (isNewTopic ? "" : ctxAspect)

  // ── Subject field ────────────────────────────────────────────────────────────
  const nextSubject = isNewTopic ? "" : (newSubjectFromQuery || "")

  // ── Context confidence ───────────────────────────────────────────────────────
  // Confidence tracks how reliable the current entity is.
  // Decays on low-quality results; resets to 1.0 on high-quality retrieval.
  // Research: TREC CAsT top systems use retrieval confidence to gate context updates.
  // When confidence < 0.3, pronouns in subsequent turns are left unresolved rather
  // than resolved to stale context (see gate above). This prevents cascade poisoning.
  const resultScore = result?.score ?? 0
  let nextConfidence: number
  if (isNewTopic && nerEntityInQuery) {
    nextConfidence = 1.0   // fresh topic confirmed by NER entity
  } else if (isNewTopic) {
    nextConfidence = 0.7   // topic switched but no NER entity — moderate confidence
  } else if (resultScore >= 0.55) {
    nextConfidence = 1.0   // high quality retrieval — full confidence
  } else if (resultScore >= 0.4) {
    nextConfidence = Math.min(1.0, ctxConfidence + 0.1)  // slight improvement
  } else if (result) {
    nextConfidence = Math.max(0, ctxConfidence - 0.45)   // poor retrieval — significant decay
  } else {
    nextConfidence = Math.max(0, ctxConfidence - 0.3)    // no result — moderate decay
  }
  // Round to 2 decimal places to keep the serialized string clean
  const nextConfRounded = Math.round(nextConfidence * 100) / 100

  // Serialize four-field context: "entity|aspect|subject|confidence"
  const nextContextParts = [nextEntity, nextAspect, nextSubject, nextConfRounded === 1 ? "" : String(nextConfRounded)]
  while (nextContextParts.length > 1 && !nextContextParts[nextContextParts.length - 1]) {
    nextContextParts.pop()
  }
  const nextContext = nextContextParts.join("|")

  if (!result) {
    return NextResponse.json({
      passage: null, deflection: "miss", url: null, title: null,
      resolvedQuery: resolved,
      nextContext,
      lastPassage: "",
    }, { status: 200 })
  }

  return NextResponse.json({
    passage:    result.passage,
    deflection: "found",
    url:        result.url,
    title:      result.title,
    score:      result.score,
    resolvedQuery: resolved,
    nextContext,
    lastPassage: result.passage,
  })
}
