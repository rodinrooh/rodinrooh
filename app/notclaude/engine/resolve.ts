/**
 * Conversational query resolution — no arbitrary word lists.
 *
 * Uses compromise.js POS tagging to detect grammatical structure.
 * In compromise v14, tags are stored as string arrays: ["Noun","Pronoun"].
 * All tag checks use Array.includes(), not property access.
 *
 * FILLER DETECTION (three methods, all structural):
 *   1. "Expression" tag  → "ok", "lmao", "yo", "omg", "woah" etc.
 *   2. "Abbreviation" tag → "fr", "tbh", "ngl", "rn" etc.
 *   3. Discourse-marker heuristic → a leading Noun (not ProperNoun) followed
 *      by a QuestionWord: "wait why" → "wait" is disposable discourse particle.
 *
 * PRONOUN RESOLUTION (linguistic binding theory, no domain word lists):
 *   Uses the pronoun-before-noun rule: if a third-person pronoun appears
 *   BEFORE any non-pronoun noun in the query, it refers to prior discourse.
 *   If a noun precedes the pronoun, the pronoun refers to that noun.
 *
 *   First/second person pronouns (I, me, my, we, us, you, your...) are
 *   excluded from replacement. These 9 base forms are a CLOSED GRAMMATICAL
 *   CLASS in English — not an arbitrary list, but a complete and stable set.
 *   Compromise v14 doesn't provide person tags, so we check by normal form.
 *
 * ENTITY EXTRACTION (high-level compromise NLP, no stop-word arrays):
 *   Uses .topics() (NER), #ProperNoun matching, .nouns() — POS-based.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nlpLib = require("compromise") as (text: string) => CompromiseDoc

interface CompromiseTerm {
  text: string
  normal: string
  tags: string[]   // compromise v14: array of tag strings, NOT {tag: boolean}
  pre?: string
  post?: string
}

interface CompromiseDoc {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json(): Array<{ terms: CompromiseTerm[] }>
  text(): string
  nouns(): CompromiseDoc
  pronouns(): CompromiseDoc
  topics(): CompromiseDoc
  match(pat: string): CompromiseDoc
  not(pat: string): CompromiseDoc
  terms(): CompromiseDoc
  out(format: "array"): string[]
  found: boolean
}

// ── Core tag helper ──────────────────────────────────────────────────────────

function hasTag(t: CompromiseTerm, tag: string): boolean {
  if (!t.tags) return false
  if (Array.isArray(t.tags)) return t.tags.includes(tag)
  // Fallback for older compromise versions that use object-style tags
  return !!(t.tags as unknown as Record<string, boolean>)[tag]
}

function terms(query: string): CompromiseTerm[] {
  // Flatten ALL sentences — compromise splits on periods (e.g. "hm ok. what is bitcoin"),
  // so json()[0] only returns the first sentence's tokens and silently drops the rest.
  // Using all sentences means "hm ok. what is compound interest" returns all 6 tokens,
  // not just [hm, ok].
  try {
    const sentences = nlpLib(query).json() as Array<{ terms?: CompromiseTerm[] }>
    return sentences.flatMap(s => s.terms ?? [])
  } catch { return [] }
}

// ── Filler detection ─────────────────────────────────────────────────────────

/**
 * Is this term a discourse particle at the start of a query?
 * Uses three structural signals, not a word list:
 *  1. Expression tag: "ok", "lmao", "yo", "woah" → compromise knows these
 *  2. Abbreviation tag: "fr", "tbh", "ngl", "rn" → informal abbreviations
 *  3. Discourse-marker heuristic: a non-verb Noun followed by a QuestionWord
 *     ("wait why" → "wait" is dispensable; "wait for me" → "wait" is not)
 */
function isLeadingFiller(t: CompromiseTerm, rest: CompromiseTerm[]): boolean {
  if (hasTag(t, "Expression")) return true
  if (hasTag(t, "Interjection")) return true
  if (hasTag(t, "Abbreviation")) return true
  // Discourse-marker heuristic: leading Noun (non-proper, non-verb) followed by a
  // content opener. Also handles Conjunctions ("k SO what is…") because bare nouns
  // at sentence start followed by conjunctions like "so" are acknowledgment particles.
  // Discourse-marker heuristic: leading Noun (non-proper, non-verb) before content.
  // Also: require rest[0].text to be non-empty — contracted tokens like "he's"
  // produce an empty Copula term at position 1 which would falsely trigger this.
  // Also: only strip if the remaining query contains a QuestionWord — "aunt is here"
  // is a statement, not a question with a leading discourse particle.
  const restHasQuestion = rest.some(t => hasTag(t, "QuestionWord") || t.text.trim().endsWith("?"))
  if (
    hasTag(t, "Noun") && !hasTag(t, "ProperNoun") && !hasTag(t, "Verb") && !hasTag(t, "Pronoun") &&
    rest.length > 0 && rest[0].text.trim().length > 0 && restHasQuestion && (
      hasTag(rest[0], "QuestionWord") ||
      hasTag(rest[0], "Verb") ||
      hasTag(rest[0], "Expression") ||
      hasTag(rest[0], "Conjunction")
    )
  ) return true
  // Short Verb before a QuestionWord is a discourse filler in informal speech:
  // "like what even..." — "like" (Verb, 4 chars) before "what" (QuestionWord).
  // Restricted to short words (≤ 5 chars) to avoid stripping real verbs like "explain".
  if (
    hasTag(t, "Verb") && !hasTag(t, "Pronoun") && t.text.length <= 5 &&
    rest.length > 0 && hasTag(rest[0], "QuestionWord") && restHasQuestion
  ) return true
  return false
}

/**
 * True if the query contains anaphoric references that should be resolved
 * against a conversation context entity.
 *
 * Covers two patterns:
 * 1. Anaphoric pronouns (it, they, he, she, that-before-verb) — "could it have survived"
 * 2. Orphaned determiner (Determiner at end, no content noun) — "has anyone found any"
 *
 * Both signals mean the user is referencing the previous topic, so topic-change
 * detection should be skipped.
 */
export function hasAnaphoricReference(query: string): boolean {
  const ts = terms(stripFiller(query))

  // Signal 1: explicit anaphoric pronoun
  if (firstAnaphoricPronounIdx(ts) !== -1) return true

  // Signal 2: orphaned determiner — same check used in resolveQuery to append context
  if (ts.length >= 2) {
    const last = ts[ts.length - 1]
    const secondLast = ts[ts.length - 2]
    if (
      hasTag(last, "Determiner") && !hasTag(last, "Pronoun") &&
      (hasTag(secondLast, "Verb") || hasTag(secondLast, "Adverb") || hasTag(secondLast, "Particle")) &&
      !ts.some(t => hasTag(t, "Noun") && !hasTag(t, "Pronoun") && !hasTag(t, "Determiner") && !hasTag(t, "Uncountable"))
    ) return true
  }

  return false
}

/**
 * Normalize missing apostrophes in informal contractions.
 * "didnt" → "didn't", "hes" → "he's", "wasnt" → "wasn't"
 *
 * Strategy: for tokens tagged as Noun, check if inserting an apostrophe
 * one character before the end creates a form that compromise recognizes
 * as a Verb, Pronoun, or Auxiliary. If yes, the word was a contraction
 * missing its apostrophe. This uses compromise as the validator — no word list.
 *
 * Works because: "didn't" is in compromise's lexicon as Verb/Auxiliary;
 * "didn" + "'t" is recognizable. "aunt" → "au'nt" is not recognized → not changed.
 */
/**
 * Normalize missing apostrophes in informal contractions.
 * "didnt" → "didn't", "hes" → "he's", "theyre" → "they're"
 *
 * Uses structural BASE-WORD validation: for a word ending in "nt",
 * check if the base (without "nt") is a recognized Verb/Auxiliary.
 * For pronoun contractions (hes/shes/theyre), check if the prefix is a Pronoun.
 * This avoids false positives on real words like "aunt" (base "au" ≠ Verb)
 * and "here" (base "he" IS a Pronoun, but "re" is not a known suffix).
 */
export function normalizeContractions(query: string): string {
  const ts = terms(query)
  const normalized = ts.map(t => {
    // Attempt on Noun or Verb tokens — context changes compromise's tag:
    // "hes" in isolation → Noun; "wait so hes" → Verb. Both need normalization.
    if ((!hasTag(t, "Noun") && !hasTag(t, "Verb")) || hasTag(t, "ProperNoun") || t.text.length < 3) return t.text
    const word = t.text
    // Already contains an apostrophe — do NOT re-process (prevents "it's" → "it''s")
    if (word.includes("'")) return word
    const lower = word.toLowerCase()

    // Pattern 1: negative contractions ending in "nt" (didnt, wasnt, wont, cant, etc.)
    // Validate: the base word (without "nt") must be a recognized Verb/Auxiliary
    if (lower.endsWith("nt") && word.length >= 4) {
      const base = word.slice(0, -2)
      const baseTerms = terms(base)
      const baseTerm = baseTerms[0]
      if (baseTerm && (hasTag(baseTerm, "Verb") || hasTag(baseTerm, "Auxiliary") || hasTag(baseTerm, "Modal"))) {
        return word.slice(0, -1) + "'" + word.slice(-1)  // "didnt" → "didn't"
      }
    }

    // Pattern 2: pronoun + copula ("hes" → "he's", "shes" → "she's")
    // Validate: all-but-last-char must be a Pronoun; last char "s" is copula suffix
    if (lower.endsWith("s") && word.length >= 3) {
      const prefix = word.slice(0, -1)
      const prefixTerms = terms(prefix)
      const prefixTerm = prefixTerms[0]
      if (prefixTerm && hasTag(prefixTerm, "Pronoun") && !FIRST_SECOND_PERSON.has(prefix.toLowerCase())) {
        return word.slice(0, -1) + "'" + word.slice(-1)  // "hes" → "he's"
      }
    }

    // Pattern 3: pronoun + "re" ("theyre" → "they're", "youre" → "you're")
    // Require prefix length >= 3 to avoid "here" → "he're" (prefix "he" = 2 chars → skip)
    if (lower.endsWith("re") && word.length >= 5) {
      const prefix = word.slice(0, -2)
      if (prefix.length >= 3) {
        const prefixTerms = terms(prefix)
        const prefixTerm = prefixTerms[0]
        if (prefixTerm && hasTag(prefixTerm, "Pronoun")) {
          return word.slice(0, -2) + "'" + word.slice(-2)  // "theyre" → "they're"
        }
      }
    }

    // Pattern 4: pronoun + "ve" ("ive" → "i've", "weve" → "we've", "youve" → "you've")
    // The apostrophe goes before "ve": "i" + "'" + "ve" = "i've"
    if (lower.endsWith("ve") && word.length >= 3) {
      const prefix = word.slice(0, -2)  // "ive" → "i", "weve" → "we"
      const prefixTerms = terms(prefix)
      const prefixTerm = prefixTerms[0]
      if (prefixTerm && hasTag(prefixTerm, "Pronoun")) {
        return prefix + "'" + word.slice(-2)  // "ive" → "i've"
      }
    }

    // Pattern 5: "thats" → "that's" (demonstrative contraction).
    // "that" is tagged as Determiner in isolation, so Pattern 2 misses it.
    // "thats" is not a valid English word — always a contraction.
    if (lower === "thats") return "that's"

    return t.text
  })
  return normalized.join(" ").trim() || query.trim()
}

export function stripFiller(query: string): string {
  const normalized = normalizeContractions(query)
  const ts = terms(normalized)

  // Strip leading filler
  let i = 0
  while (i < ts.length && isLeadingFiller(ts[i], ts.slice(i + 1))) i++
  let core = ts.slice(i)

  // Strip trailing polar suffix: [Conjunction "or"] + [Expression/Interjection]
  // Covers informal tag-question forms ("or nah", "or what") documented in NLP literature.
  // "or" is a Conjunction; what follows is a filler-class word, not query content.
  if (core.length >= 2) {
    const last = core[core.length - 1]
    const prev = core[core.length - 2]
    if (
      (prev.normal?.toLowerCase() === "or") && hasTag(prev, "Conjunction") &&
      (hasTag(last, "Expression") || hasTag(last, "Interjection") ||
       (hasTag(last, "QuestionWord") && core.length >= 3))
    ) {
      core = core.slice(0, -2)
    }
  }

  // Strip trailing singular first-person epistemic hedge: ends with [I] [Verb]
  // or [I] [Verb] [Verb] ("i keep forgetting", "i think", "i forget").
  // Restricted to singular "I" — "we [verb]" is a genuine query ("we cooked"),
  // not a metalinguistic annotation. Singular "I" at end of a query is always self-referential.
  if (core.length >= 2) {
    const last = core[core.length - 1]
    const prev = core[core.length - 2]
    if (hasTag(last, "Verb") && prev.normal?.toLowerCase() === "i") {
      core = core.slice(0, -2)
    } else if (core.length >= 3) {
      const ante = core[core.length - 3]
      if (
        hasTag(last, "Verb") && hasTag(prev, "Verb") &&
        ante.normal?.toLowerCase() === "i"
      ) {
        core = core.slice(0, -3)
      }
    }
  }

  // Return empty string when everything was filler — caller treats empty as a phatic/null query.
  // Do NOT fall back to the original: "yo" stripping to "" should stay "", not return "yo".
  return core.map(t => t.text).join(" ").trim()
}

// ── Pronoun analysis ─────────────────────────────────────────────────────────

/**
 * First and second person pronouns.
 * This is a COMPLETE, FINITE, GRAMMATICALLY-DEFINED set — not an arbitrary list.
 * English grammar precisely defines these forms; no new ones are coined.
 * We check by normal form because compromise v14 doesn't provide person tags.
 */
const FIRST_SECOND_PERSON = new Set([
  "i", "me", "my", "mine", "myself",
  "we", "us", "our", "ours", "ourselves",
  "you", "your", "yours", "yourself", "yourselves",
])

/**
 * "that" as demonstrative pronoun: "how long does THAT take" / "explain THAT"
 * Compromise tags "that" as Determiner in all contexts — it doesn't distinguish
 * "that car" (modifier) from "how does that work" (predicate pronoun).
 * Structural rule: "that" before a Verb (not before a Noun) is pronominal.
 *   "that car is fast"     → "that" before Noun → modifier, skip
 *   "how long does that take" → "that" before Verb → pronoun, replace ✓
 */
function isThatAsPronoun(t: CompromiseTerm, nextT?: CompromiseTerm): boolean {
  const normal = t.normal.toLowerCase()
  const text = t.text.toLowerCase()
  // Match "that" (normal form) and contracted forms "that's" / "thats"
  // "that's" = "that is" — always pronominal ("we absolutely cooked if that's real")
  if (normal === "that's" || text === "thats" || text === "that's") return true
  if (normal !== "that") return false
  if (!nextT) return true  // "that" at end of query → anaphoric
  // If next token is a Noun → "that X" = determiner
  if (hasTag(nextT, "Noun") && !hasTag(nextT, "Pronoun")) return false
  return true  // next token is Verb/Adverb/end → pronoun
}

function isAnaphoricPronoun(t: CompromiseTerm, nextT?: CompromiseTerm): boolean {
  const normal = t.normal.toLowerCase()
  if (hasTag(t, "Pronoun")) {
    if (FIRST_SECOND_PERSON.has(normal)) return false
    // Contracted forms ("i’ve", "i’m", "we’re", "you’ve") — strip pre-apostrophe base
    const base = normal.replace(/[‘’].*$/, "")
    if (FIRST_SECOND_PERSON.has(base)) return false
    // "there" — compromise tags locative "there" as Pronoun, but it should NEVER
    // be replaced with a context entity. "when did they move there" is asking about
    // a location, not the topic entity. Only existential "there is/are" is a
    // pronoun, and even then it doesn’t refer to a prior entity.
    if (normal === "there" || normal === "here") return false
    return true
  }
  if (normal === "it") return true
  if (isThatAsPronoun(t, nextT)) return true
  // Indefinite existential pronouns via Uncountable tag: "anything", "something", "everything"
  // These quantify over the prior context entity ("has anything fallen into [black hole]").
  // Exclude locative adverbs "there" and "here" — they are spatial referents, not entity
  // pronouns. "when did they move there" → "there" = Austin, not the context entity.
  // POS-based: Noun + Uncountable — no word list.
  if (hasTag(t, "Noun") && hasTag(t, "Uncountable") && !FIRST_SECOND_PERSON.has(normal)) {
    if (normal === "there" || normal === "here") return false  // locative adverbs, not anaphoric
    return true
  }
  // Possessive pronouns ("its", "their", "his", "her") — anaphoric even without Pronoun tag.
  // CRITICAL DISCRIMINATION: "its" has [Noun,Possessive] only.
  // "city's", "france's" have [Noun,Singular,Possessive] or [Noun,ProperNoun,Possessive].
  // Concrete nouns ALWAYS have Singular/ProperNoun/Organization/Place alongside Possessive.
  // Pronouns have ONLY Noun+Possessive (no specificity markers).
  // This is purely structural (POS tag set), not a word list — works for any language variant.
  if (hasTag(t, "Possessive") && !FIRST_SECOND_PERSON.has(normal)) {
    const isConcrete = hasTag(t, "Singular") || hasTag(t, "ProperNoun") ||
                       hasTag(t, "Organization") || hasTag(t, "Place")
    if (!isConcrete) return true
  }
  return false
}

/**
 * Return the index of the first third-person anaphoric pronoun in the term list.
 * Passes the next term so "that" can be context-checked.
 */
function firstAnaphoricPronounIdx(ts: CompromiseTerm[]): number {
  for (let i = 0; i < ts.length; i++) {
    if (isAnaphoricPronoun(ts[i], ts[i + 1])) return i
  }
  return -1
}

/**
 * Pronoun-before-noun rule (linguistic binding theory):
 * If a SPECIFIC non-pronoun noun appears BEFORE the pronoun, the pronoun
 * likely refers to that noun (local binding), not to prior discourse.
 *
 * Specificity requirement: the noun must be a concrete, definite referent.
 * Indefinite nouns (anyone/someone/anything — tagged as Uncountable and lacking
 * Actor/ProperNoun) are NOT specific enough to bind a personal pronoun.
 * Compare:
 *   "why do HUMANS cry when they're sad" → "humans" is Actor/Plural → specific → local ✓
 *   "did ANYONE believe him at the time" → "anyone" is Uncountable → indefinite → NOT local → "him" = prior context ✓
 */
function pronounRefersToOwnSubject(ts: CompromiseTerm[], pronounIdx: number): boolean {
  for (let i = 0; i < pronounIdx; i++) {
    const t = ts[i]
    if (!hasTag(t, "Noun") || hasTag(t, "Pronoun") || hasTag(t, "Possessive")) continue
    // Only REAL ENTITIES bind personal pronouns: proper nouns (Sam Altman),
    // actors/animate entities (humans, scientists), and countable plurals (cells).
    // Abstract/action nouns ("wait", "charge") and indefinites ("anyone", "something")
    // do NOT bind personal pronouns.
    //
    // "wait so he's still in charge" → "wait" is Noun, Singular, but NOT Actor/ProperNoun/Plural
    // → does NOT count → "he's" refers to prior discourse → correctly replaced ✓
    // "why do humans cry when they're sad" → "humans" IS Actor → binds "they're" ✓
    // "it" is a neuter pronoun — binds to inanimate things/concepts, NOT animate subjects.
    // "can ADULTS get it?" → "it" = ADHD (external context), not "adults" (animate plural).
    // "why do HUMANS cry when they're sad?" → "they" = humans (animate, local binding).
    //
    // Rule: for neuter "it", only ProperNoun or Actor can bind (specific named entities only).
    // For animate pronouns (they/he/she), countable Plural also binds.
    // This distinguishes "it" (thing/condition) from "they/he/she" (people/animate).
    const pronounText = ts[pronounIdx]?.normal?.toLowerCase()
    const pronounIsNeuter = pronounText === "it" || pronounText === "it's" || pronounText === "its"

    // If the token immediately before the pronoun is a main Verb (not Copula or Auxiliary),
    // the pronoun is in direct-object position — it refers to the context entity, not the
    // clause's own subject. "do animals get THEM" → "get" (Verb) precedes "them" → object.
    // This doesn't apply when the preceding token is a Conjunction ("when THEY'RE sad" is
    // a subject pronoun in a subordinate clause, correctly binding to the local subject).
    const prevTerm = pronounIdx > 0 ? ts[pronounIdx - 1] : null
    const pronounIsObjectPosition = prevTerm !== null &&
      hasTag(prevTerm, "Verb") && !hasTag(prevTerm, "Copula") &&
      !hasTag(prevTerm, "Auxiliary") && !hasTag(prevTerm, "Modal")

    // Technical/scientific nouns ≥ 6 chars that compromise doesn't know (e.g. "crispr",
    // "quasar", "photon") won't have ProperNoun tag but are still specific entities.
    // ≥ 6 chars excludes common 5-char sport/general nouns ("slams", "books", "album")
    // that should not prevent pronoun resolution from accessing the conversation context.
    // "slams" in "how many grand slams does she have" must not bind "she" locally.
    const isSpecificUnknownNoun = !pronounIsNeuter && hasTag(t, "Noun") &&
                                   !hasTag(t, "Pronoun") && t.text.length >= 6
    const isRealEntity = hasTag(t, "Actor") || hasTag(t, "ProperNoun") || isSpecificUnknownNoun ||
                         (!pronounIsNeuter && !pronounIsObjectPosition &&
                          hasTag(t, "Plural") && !hasTag(t, "Uncountable"))
    if (isRealEntity) return true
  }
  return false
}

// ── Topic change detection ────────────────────────────────────────────────────

export function detectTopicChange(query: string): { isNewTopic: boolean; newQuery: string } {
  // Preamble-separator pattern: "transition phrase [sep] real question"
  // Handles em-dash, en-dash, spaced hyphen ( - ), colon, double-dash (--)
  // Note: must run on RAW query string before stripFiller, because compromise
  // term reconstruction drops punctuation stored in pre/post metadata fields.
  //
  // The preamble is transitional (not a named entity reference) when it contains
  // no proper nouns — checked via NLP, not a word list.
  const sepRe = /^(.{0,100}?)\s*(?:[—–]|(?:\s+-+\s+)|(?::\s))\s*(.{4,})$/
  const m = query.match(sepRe)
  if (m) {
    const preamble = m[1].trim()
    const after    = m[2].trim()
    if (after.length > 3 && preamble.length > 0) {
      const preambleDoc = nlpLib(preamble)
      // Keep preamble-based content if it introduces a named entity (not just transition words)
      if (!preambleDoc.match("#ProperNoun").found) {
        return { isNewTopic: true, newQuery: after }
      }
    }
  }
  return { isNewTopic: false, newQuery: query }
}

// ── Single bare-question detection ───────────────────────────────────────────

function isBareQuestionWord(ts: CompromiseTerm[]): string | null {
  const real = ts.filter(t => t.normal.replace(/[?!.,]/g, "").length > 0)
  // Single question word: "when", "where", "why", "how", "who", "what"
  if (real.length === 1 && hasTag(real[0], "QuestionWord")) {
    return real[0].normal.replace(/[?!]/g, "")
  }
  // QuestionWord + single Adverb intensifier: "when exactly", "where precisely", "how exactly"
  // Structural POS pattern — works for any QuestionWord + Adverb combination without word lists.
  if (real.length === 2 && hasTag(real[0], "QuestionWord") && hasTag(real[1], "Adverb")) {
    return real[0].normal.replace(/[?!]/g, "")
  }
  return null
}

// ── eli5 detection ───────────────────────────────────────────────────────────

function isEli5(ts: CompromiseTerm[]): boolean {
  return ts.length > 0 && ts[0].normal === "eli5"
}

// ── Pronoun replacement ───────────────────────────────────────────────────────

function replacePronounsWithContext(ts: CompromiseTerm[], entity: string, answerEntity?: string): string {
  // Animacy gate: if the context entity is a verb/process (e.g., "yawn"),
  // don't substitute animate pronouns (they/he/she) in subject position.
  // Binding theory: animate pronouns expect animate noun antecedents.
  // Research: JAIR 2007, COLING 2018 — animacy as a coreference gate.
  const entityTokens = terms(entity)
  // Block animate pronoun substitution when entity is a Verb/process ("yawn")
  // OR an Honorific title abbreviation ("Rev", "Dr", "Mr").
  // "Rev" for "Reverend" can't be a referent for plural "they" — and if it
  // leaked through entity extraction, this gate catches the substitution.
  // Honorific check: POS-based, covers all title abbreviations compromise knows.
  const entityIsProcess = entityTokens.length === 1 && (
    (hasTag(entityTokens[0], "Verb") && !hasTag(entityTokens[0], "Noun")) ||
    hasTag(entityTokens[0], "Honorific")
  )

  const ANIMATE_PRONOUNS = new Set(["they", "he", "she", "them", "him", "her", "their", "his", "hers", "themselves"])

  return ts.map((t, i) => {
    if (!isAnaphoricPronoun(t, ts[i + 1])) return t.text
    // Per-pronoun local binding check
    if (pronounRefersToOwnSubject(ts, i)) return t.text
    // Animacy gate: entity is a verb/process — skip for animate pronouns
    if (entityIsProcess && ANIMATE_PRONOUNS.has(t.normal?.toLowerCase() ?? "")) return t.text
    if (hasTag(t, "Possessive")) return `${entity}'s`
    // "it's"/"its"/"he's"/"she's"/"they're" — disambiguate copula vs possessive.
    // Structural: if the NEXT real token is Noun/Adjective → possessive ("it's capital").
    // If Verb/Adverb or absent → copula ("it's raining").
    if (/^(it'?s|he'?s|she'?s|they'?re|its)$/i.test(t.text)) {
      let nextContentIdx = i + 1
      while (nextContentIdx < ts.length && ts[nextContentIdx].text.trim() === "") nextContentIdx++
      const nextContent = ts[nextContentIdx]
      const isPossessivePosition = nextContent &&
        (hasTag(nextContent, "Noun") || hasTag(nextContent, "Adjective") || hasTag(nextContent, "ProperNoun"))
      return isPossessivePosition ? `${entity}'s` : `${entity} is`
    }
    // Dual-entity routing based on QuAC (2018) + Centering Theory (Grosz et al. 1995):
    // Animate singular pronouns (he/she/him/her) tend to refer to the ANSWER entity
    // when the answer was a person — e.g., "who is the CEO of Apple?" → "Tim Cook" →
    // "how long has he been there?" → "he" = Tim Cook, not Apple.
    // This is a grammatically CLOSED CLASS (English singular gender pronouns),
    // not an arbitrary word list. Only animate singular, NOT they/their (too ambiguous).
    const pronounNormal = t.normal?.toLowerCase() ?? ""
    const isAnimateSingular = pronounNormal === "he" || pronounNormal === "him" ||
                              pronounNormal === "she" || pronounNormal === "her"
    if (isAnimateSingular && answerEntity) return answerEntity
    return entity
  }).join(" ").replace(/\s{2,}/g, " ").trim()
}

// ── Main export ──────────────────────────────────────────────────────────────

export function resolveQuery(
  rawQuery: string,
  context: string,
  answerEntity?: string
): { resolved: string; isNewTopic: boolean; newSubject?: string } {
  // 2. Topic change is checked on the RAW string — before filler stripping.
  //    Reason: stripFiller() reconstructs text from compromise term objects.
  //    Em dashes (—) are stored in compromise's pre/post punctuation metadata,
  //    not in t.text, so they're silently lost during reconstruction.
  //    Checking the original string preserves the dash so the regex can find it.
  const { isNewTopic, newQuery } = detectTopicChange(rawQuery.trim())
  if (isNewTopic) return { resolved: stripFiller(newQuery), isNewTopic: true }

  // 1. Strip leading discourse particles via POS tagging
  const q = stripFiller(rawQuery)
  if (!q) return { resolved: rawQuery.trim(), isNewTopic: false }

  if (!context.trim()) return { resolved: q, isNewTopic: false }

  const ts = terms(q)
  const ctx = context.trim()

  // 2.5. "what about X" / "how about X" — subject shift within topic.
  // The grammatical subject shifts to X while the topic stays the same.
  // "what about algae" in a photosynthesis conversation → algae is the new subject.
  // Return newSubject so the caller can track it separately from the topic entity.
  // Research: Hobbs (1978) notes subject-position NPs are the highest-salience referents;
  // "what about X" structurally positions X as the new subject (pobj of "about").
  const whatAboutM = q.match(/^(?:what|how)\s+about\s+(.+?)(?:\?+)?$/i)
  if (whatAboutM) {
    const newSubject = whatAboutM[1].trim().toLowerCase()
    // Return query resolved to "[newSubject] [ctx]" for enriched search, tracking newSubject
    return { resolved: `${newSubject} ${ctx}`, isNewTopic: false, newSubject }
  }

  // 3. Single bare question word → expand with context
  const bareWord = isBareQuestionWord(ts)
  if (bareWord) {
    const expand: Record<string, string> = {
      when: "when was", where: "where is", why: "why did",
      who: "who is", how: "how does", what: "what is",
    }
    return { resolved: `${expand[bareWord] ?? bareWord} ${ctx}`, isNewTopic: false }
  }

  // 4. "eli5" shorthand → expand with context
  if (isEli5(ts)) {
    return { resolved: `explain ${ctx} simply in plain language`, isNewTopic: false }
  }

  // 5. "there's other X??" pattern → topic-branching question
  // Note: trailing "??" may be stripped by compromise's tokenizer, so make \?+ optional
  const thereM = q.match(/^(?:wait\s+)?there'?s\s+(?:other\s+)?([\w\s]+?)(?:\?+)?$/i)
  if (thereM) {
    return { resolved: `what are the different types of ${thereM[1].trim()}`, isNewTopic: false }
  }

  // 6. Orphaned-determiner check (VP/NP ellipsis).
  // "has anyone found any" → "any" is a Determiner at end with no Noun object after the Verb.
  // The Determiner implicitly refers to the context entity ("any [dark matter]").
  // Structural: last token = Determiner, preceded by Verb/Adverb, no content noun in query.
  // Must run BEFORE the pronoun check early-return (pronIdx === -1 would skip this otherwise).
  if (ts.length >= 2) {
    const last = ts[ts.length - 1]
    const secondLast = ts[ts.length - 2]
    if (
      hasTag(last, "Determiner") && !hasTag(last, "Pronoun") &&
      (hasTag(secondLast, "Verb") || hasTag(secondLast, "Adverb") || hasTag(secondLast, "Particle")) &&
      !ts.some(t => hasTag(t, "Noun") && !hasTag(t, "Pronoun") && !hasTag(t, "Determiner") && !hasTag(t, "Uncountable"))
    ) {
      return { resolved: `${q} ${ctx}`, isNewTopic: false }
    }
  }

  // 7. Check for anaphoric pronouns
  const pronIdx = firstAnaphoricPronounIdx(ts)
  if (pronIdx === -1) return { resolved: q, isNewTopic: false }

  // 8. Pronoun-before-noun rule: if a noun precedes the pronoun, it's self-referential
  if (pronounRefersToOwnSubject(ts, pronIdx)) return { resolved: q, isNewTopic: false }

  // 9. Replace anaphoric pronouns with context entity
  let resolved = replacePronounsWithContext(ts, ctx, answerEntity)

  // 9. "which one" → "which [context]" (indefinite pronoun pattern)
  resolved = resolved.replace(/\bwhich\s+one\b/gi, `which ${ctx}`)

  // 10. "the opposite" referent → "the opposite of [context]"
  resolved = resolved.replace(/\bthe\s+opposite(?:\s+of\s+(?:it|this|that))?\b/gi, `the opposite of ${ctx}`)

  return { resolved, isNewTopic: false }
}

// ── Entity extraction ─────────────────────────────────────────────────────────

export function extractEntity(query: string): string {
  const q = query.replace(/[?!.,]+$/, "").trim()
  if (!q) return ""
  try {
    const doc = nlpLib(q)
    const ts = terms(q)

    // 1. Named entities — most specific.
    // Filter out Honorific-tagged topics: "Rev", "Dr", "Mr", "Prof" etc.
    // compromise tags these as Abbreviation+Honorific+ProperNoun, meaning
    // "rev" in "cars rev higher" gets misidentified as "Reverend" (a title).
    // Honorific entries are titles, never valid conversational topic entities.
    // POS-based filter — works for any abbreviation/title, no word list needed.
    const allTopics = doc.topics().out("array") as string[]
    const topics = allTopics.filter(t => {
      const tTerms = (nlpLib(t) as any).json()[0]?.terms ?? []
      // Exclude Honorific abbreviations (Rev, Dr, Mr — see earlier fix)
      if (tTerms.some((term: { tags?: string[] }) => term.tags?.includes("Honorific"))) return false
      // Exclude highly generic English meta-words: compromise can promote "context",
      // "meaning", "definition" etc. from explanatory passages. These are abstract
      // discourse-meta nouns — never valid conversational topic entities.
      // Detected by: single-word, Uncountable tag (abstract mass noun), no ProperNoun tag.
      if (tTerms.length === 1) {
        const onlyTerm = tTerms[0]
        if (onlyTerm?.tags?.includes("Uncountable") && !onlyTerm?.tags?.includes("ProperNoun")) return false
      }
      return true
    })
    if (topics.length > 0) return topics[0].toLowerCase().slice(0, 80)

    // 2. Structural extraction for "why/how/when/what did X [verb]" queries.
    //    In English, "why did [SUBJECT] [VERB]?" places the subject between
    //    the auxiliary "did" and the main verb.
    //    - "why did blockbuster fail" → no Verb after "did" → take first noun = "blockbuster"
    //    - "what did elon musk do before tesla" → Verb "do" found → nouns before it = "elon musk"
    const didIdx = ts.findIndex(t => t.normal === "did" && hasTag(t, "Verb"))
    if (didIdx !== -1) {
      // Find the next main Verb after "did" (not the auxiliary itself)
      let nextVerbIdx = -1
      for (let i = didIdx + 1; i < ts.length; i++) {
        if (hasTag(ts[i], "Verb") && !hasTag(ts[i], "Auxiliary") && !hasTag(ts[i], "Pronoun")) {
          nextVerbIdx = i
          break
        }
      }
      // Collect non-pronoun nouns between "did" and the next main Verb
      const boundary = nextVerbIdx !== -1 ? nextVerbIdx : didIdx + 2  // stop after 1 noun if no Verb found
      const subjectNouns = ts
        .slice(didIdx + 1, nextVerbIdx !== -1 ? nextVerbIdx : undefined)
        .filter(t => hasTag(t, "Noun") && !hasTag(t, "Pronoun"))
        .map(t => t.normal)
      if (subjectNouns.length > 0) {
        // Cap at 2 words; if no Verb boundary found, only take 1 word (avoids "blockbuster fail")
        const cap = nextVerbIdx !== -1 ? 2 : 1
        return subjectNouns.slice(0, cap).join(" ").toLowerCase().slice(0, 80)
      }
      void boundary  // suppress unused variable warning
    }

    // 3. For "what is/are X" and other topic queries: use the first noun phrase
    //    that doesn't contain an Honorific abbreviation.
    // "cars rev higher" contains "rev" (Honorific=Reverend) — skip it.
    // "twin turbo cars" has no Honorific → use it.
    // This prevents verb-nouns like "rev" from contaminating compound noun phrases.
    const nouns = doc.nouns().not("#Pronoun").out("array") as string[]
    for (const noun of nouns) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nTerms = (nlpLib(noun) as any).json()[0]?.terms ?? []
      if (nTerms.some((t: { tags?: string[] }) => t.tags?.includes("Honorific"))) continue
      const cleaned = noun
        .replace(/^(the|a|an|some)\s+/i, "")
        .replace(/\s+(?:of|for|in|on)\s+.+$/i, "")
        .trim()
        .toLowerCase()
      if (cleaned.length >= 2) return cleaned.slice(0, 80)
    }

    // 4. Fallback: any non-function-word term
    const content = doc
      .not("#Preposition").not("#Conjunction").not("#Auxiliary")
      .not("#Modal").not("#Determiner").not("#QuestionWord").not("#Pronoun")
      .terms().out("array") as string[]
    if (content.length > 0) return content[0].toLowerCase().slice(0, 80)
  } catch { /* compromise parse failure */ }
  return ""
}
