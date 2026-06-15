/**
 * Sentence similarity via HF Inference API (sentence-transformers/all-MiniLM-L6-v2).
 * Falls back to recall-based content-word scoring if HF is unavailable.
 *
 * The fallback uses `compromise` (already installed) to extract semantic content words
 * (nouns, verbs, adjectives) from the query — no hardcoded stopword list.
 * This is what fixes the "You" grammar article collision: "what happens if you swallow gum"
 * extracts {happens, swallow, gum}, which score 0 against the "You" pronoun article.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
type CompromiseView = { out: (fmt: "array") => string[]; not: (tag: string) => CompromiseView }
type CompromiseDoc = {
  nouns: () => CompromiseView
  verbs: () => CompromiseView
  adjectives: () => CompromiseView
  not: (tag: string) => CompromiseDoc
  terms: () => CompromiseView
}
const nlp = require("compromise") as (text: string) => CompromiseDoc

const HF_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
const HF_API_URL = `https://api-inference.huggingface.co/models/${HF_MODEL}`
const HF_TOKEN = process.env.HF_TOKEN

/**
 * Extract semantic content words from text using NLP POS tagging.
 * Uses compromise to filter pronouns, prepositions, auxiliaries, etc. at the POS level —
 * no hardcoded stopword list. Then splits any multi-word phrases into individual tokens.
 *
 * "what happens if you swallow gum" → ["happens", "swallow", "gum"]
 * "why does helium make your voice higher" → ["helium", "voice", "higher"]
 * "why do my fingers wrinkle in the bath" → ["fingers", "wrinkle", "bath"]
 */
function contentWords(text: string): string[] {
  try {
    const doc = nlp(text)
    // Filter grammatical function words by POS — no word list needed.
    // Individual terms() after filtering gives single tokens, not multi-word phrases.
    return (doc
      .not("#Pronoun")
      .not("#Preposition")
      .not("#Conjunction")
      .not("#Auxiliary")
      .not("#Modal")
      .not("#Determiner")
      .not("#Adverb")
      .not("#QuestionWord")
      .terms()
      .out("array") as string[])
      .flatMap(w => w.toLowerCase().split(/\W+/))  // split any multi-word phrases
      .filter(w => w.length > 2)
  } catch {
    return text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 4)
  }
}

/**
 * Recall scoring: what fraction of semantic query words appear in the passage?
 * 1.0 = all query content words found, 0 = none found.
 *
 * Uses WORD-BOUNDARY matching to prevent false positives:
 * - "wear" must NOT match "eyewear" (glasses fog → Ballistic eyewear collision)
 * - "fog" must NOT match "anti-fogging" (scored via full word form "fogging")
 * Morphological variants (fogging/fogged/fogs) are matched via word-boundary prefix.
 */
function recallScore(query: string, passage: string): number {
  const qWords = [...new Set(contentWords(query))]
  if (!qWords.length) return 0
  // Normalize to individual tokens — replace hyphens etc. with spaces for boundary matching
  const pLow = passage.toLowerCase().replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ")

  let matched = 0
  for (const q of qWords) {
    // Generate the specific morphological forms to check — not a wildcard regex.
    // Wildcard `\b${stem}[a-z]{0,4}\b` is too broad: "ball" → matches "ballpark", "ballet".
    // Instead, enumerate the specific forms for BOTH directions:
    const forms = new Set([q])
    // Longer forms (suffixes): fog → fogging/fogged/fogs
    const stem = q.endsWith("e") ? q.slice(0, -1) : q
    forms.add(stem + "s").add(stem + "es").add(stem + "ing").add(stem + "ed").add(stem + "er")
    // Shorter forms (stem reduction): fingers → finger, cracking → crack
    if (q.endsWith("s") && q.length > 4) forms.add(q.slice(0, -1))
    if (q.endsWith("es") && q.length > 4) forms.add(q.slice(0, -2))
    if (q.endsWith("ing") && q.length > 5) forms.add(q.slice(0, -3))
    if (q.endsWith("ed") && q.length > 4) forms.add(q.slice(0, -2))
    // Check each specific form with word boundary — no wildcard expansion
    const matched_q = [...forms].some(f => new RegExp(`\\b${f}\\b`).test(pLow))
    if (matched_q) matched++
  }
  return matched / qWords.length
}

export async function rankPassages(
  query: string,
  passages: string[]
): Promise<Array<{ passage: string; score: number }>> {
  if (!passages.length) return []

  const trimmed = passages.map(p => p.slice(0, 512))

  // Try HF Inference API (same model, runs on HF servers — no local binary needed)
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (HF_TOKEN) headers["Authorization"] = `Bearer ${HF_TOKEN}`

    const res = await fetch(HF_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        inputs: { source_sentence: query.slice(0, 512), sentences: trimmed },
        options: { wait_for_model: true },
      }),
      signal: AbortSignal.timeout(15000),  // 15s — authenticated requests get priority on warm models
    })

    if (res.ok) {
      const scores = await res.json() as number[]
      if (Array.isArray(scores) && scores.length === passages.length) {
        console.log("[HF] success, top score:", Math.max(...scores).toFixed(3))
        return passages
          .map((p, i) => ({ passage: p, score: scores[i] }))
          .sort((a, b) => b.score - a.score)
      }
      console.log("[HF] unexpected response shape:", JSON.stringify(scores).slice(0, 100))
    } else {
      console.log("[HF] error:", res.status, await res.text().then(t => t.slice(0, 200)))
    }
  } catch (e) {
    console.log("[HF] exception:", String(e).slice(0, 100))
  }

  // Fallback: content-word recall scoring (NLP-based, no stopword list)
  return passages
    .map(p => ({ passage: p, score: recallScore(query, p) }))
    .sort((a, b) => b.score - a.score)
}
