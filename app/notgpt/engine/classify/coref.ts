export type EntityRef = {
  qid?: string
  title: string
  kind: "human" | "place" | "org" | "thing"
  gender?: "m" | "f" | "x"
}

export type TurnContext = {
  role: "user" | "assistant"
  entities: EntityRef[]
  intent: string
}

type CorefResult = {
  resolved: string
  coref: { pronoun: string; resolvedTo: string } | null
  clarifyEntities?: EntityRef[]
}

// Pronouns grouped by type
const MALE_PRONOUNS = /\b(he|him|his)\b/gi
const FEMALE_PRONOUNS = /\b(she|her|hers)\b/gi
const NEUTRAL_PRONOUNS = /\b(it|its)\b/gi
const PLURAL_PRONOUNS = /\b(they|them|their|theirs)\b/gi
const ANY_PRONOUN = /\b(he|him|his|she|her|hers|it|its|they|them|their|theirs)\b/gi

/**
 * Detects the first pronoun in the query, if any.
 */
function detectPronoun(query: string): { pronoun: string; gender: "m" | "f" | "x" | "plural" } | null {
  const lower = query.toLowerCase()

  // Reset lastIndex
  MALE_PRONOUNS.lastIndex = 0
  FEMALE_PRONOUNS.lastIndex = 0
  NEUTRAL_PRONOUNS.lastIndex = 0
  PLURAL_PRONOUNS.lastIndex = 0

  if (MALE_PRONOUNS.test(lower)) return { pronoun: "he/him/his", gender: "m" }
  if (FEMALE_PRONOUNS.test(lower)) return { pronoun: "she/her/hers", gender: "f" }
  if (NEUTRAL_PRONOUNS.test(lower)) return { pronoun: "it/its", gender: "x" }
  if (PLURAL_PRONOUNS.test(lower)) return { pronoun: "they/them/their", gender: "plural" }

  return null
}

/**
 * Collects all entities from recent context turns (most recent first).
 */
function collectEntities(turns: TurnContext[]): EntityRef[] {
  const seen = new Set<string>()
  const entities: EntityRef[] = []

  // Iterate from most recent to oldest
  for (let i = turns.length - 1; i >= 0; i--) {
    for (const entity of turns[i].entities) {
      const key = entity.qid ?? entity.title.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        entities.push(entity)
      }
    }
  }

  return entities
}

/**
 * Finds the best candidate entity for a given pronoun gender/type.
 */
function findCandidate(
  entities: EntityRef[],
  gender: "m" | "f" | "x" | "plural"
): EntityRef | null {
  if (gender === "plural") {
    // For plural, prefer orgs or groups; then any
    const org = entities.find((e) => e.kind === "org")
    if (org) return org
    // Fall back to most recent entity
    return entities[0] ?? null
  }

  if (gender === "x") {
    // For it/its, prefer non-human entities
    const thing = entities.find((e) => e.kind === "thing" || e.kind === "place" || e.kind === "org")
    if (thing) return thing
    return entities[0] ?? null
  }

  // For gendered pronouns, filter by matching gender if available
  const gendered = entities.filter((e) => e.gender === gender)
  if (gendered.length > 0) return gendered[0]

  // If no gender match but only one entity, use it
  if (entities.length === 1) return entities[0]

  return null
}

/**
 * Replaces pronouns in a query with the entity title.
 */
function substitutePronouns(query: string, entityTitle: string): string {
  return query
    .replace(/\b(he|she|it)\b/gi, entityTitle)
    .replace(/\b(him|her)\b/gi, entityTitle)
    .replace(/\b(his|hers|its)\b/gi, `${entityTitle}'s`)
    .replace(/\b(they|them)\b/gi, entityTitle)
    .replace(/\b(their|theirs)\b/gi, `${entityTitle}'s`)
}

/**
 * Resolves pronouns in a query by looking at conversation context.
 *
 * If resolved: returns { resolved: updatedQuery, coref: { pronoun, resolvedTo } }
 * If ambiguous: returns { resolved: originalQuery, coref: null, clarifyEntities: [...] }
 * If no pronouns: returns { resolved: originalQuery, coref: null }
 */
export function resolveCoref(query: string, turns: TurnContext[]): CorefResult {
  const detected = detectPronoun(query)

  if (!detected) {
    return { resolved: query, coref: null }
  }

  if (!turns || turns.length === 0) {
    return { resolved: query, coref: null }
  }

  const entities = collectEntities(turns)

  if (entities.length === 0) {
    return { resolved: query, coref: null }
  }

  const candidate = findCandidate(entities, detected.gender)

  if (!candidate) {
    // Ambiguous — multiple candidates with no clear winner
    return {
      resolved: query,
      coref: null,
      clarifyEntities: entities.slice(0, 3),
    }
  }

  // Check for ambiguity: multiple strong candidates for the same gender
  const matchingGender =
    detected.gender === "m" || detected.gender === "f"
      ? entities.filter((e) => e.gender === detected.gender)
      : []

  if (matchingGender.length > 1) {
    return {
      resolved: query,
      coref: null,
      clarifyEntities: matchingGender.slice(0, 3),
    }
  }

  const resolved = substitutePronouns(query, candidate.title)

  return {
    resolved,
    coref: {
      pronoun: detected.pronoun,
      resolvedTo: candidate.title,
    },
  }
}
