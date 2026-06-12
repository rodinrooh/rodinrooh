import { normalize } from "./normalize"
import { extractModifiers, Modifier } from "./modifiers"
import { resolveCoref, TurnContext } from "./coref"
import { Intent, MatchResult } from "./matchers/index"
import { matchSafety } from "./matchers/safety"
import { matchEasterEgg } from "./matchers/easterEgg"
import { matchMeta } from "./matchers/meta"
import { matchJailbreak } from "./matchers/jailbreak"
import { matchRoleplay } from "./matchers/roleplay"
import { matchCreative } from "./matchers/creative"
import { matchCode } from "./matchers/code"
import { matchMath } from "./matchers/math"
import { matchUnits } from "./matchers/units"
import { matchCurrency } from "./matchers/currency"
import { matchTime } from "./matchers/time"
import { matchWeather } from "./matchers/weather"
import { matchDefinition } from "./matchers/definition"
import { matchSpelling } from "./matchers/spelling"
import { matchComparison } from "./matchers/comparison"
import { matchStructuredFact } from "./matchers/structuredFact"
import { matchNewsRecent } from "./matchers/newsRecent"
import { matchOpinion } from "./matchers/opinion"
import { matchLookup } from "./matchers/lookup"

export type ClassifyResult = {
  intent: Intent
  confidence: number
  slots: Record<string, string>
  modifiers: Modifier[]
  residual: string
  scaffoldKind: string | null
  coref: { pronoun: string; resolvedTo: string } | null
  trace: Array<{ matcher: string; result: "claimed" | "passed" | "fallthrough" }>
}

type TraceEntry = { matcher: string; result: "claimed" | "passed" | "fallthrough" }

/**
 * Check if a query string looks like a comparison ("X vs Y", "difference between X and Y").
 * Used to decide whether to run comparison or fall through to lookup.
 */
function looksLikeComparison(text: string): boolean {
  return (
    /\bvs\.?\b|\bversus\b/i.test(text) ||
    /\bdifference\s+between\b/i.test(text) ||
    /^compare\s+/i.test(text)
  )
}

/**
 * Main classify function.
 * Runs the full pipeline: normalize → coref → modifiers → matchers in precedence order.
 */
export function classify(raw: string, context?: TurnContext[]): ClassifyResult {
  const trace: TraceEntry[] = []

  // Step 1: Normalize
  const { normalized, scaffoldKind, residual: rawResidual } = normalize(raw)

  // Step 2: Coref resolution
  let resolvedQuery = normalized
  let coref: { pronoun: string; resolvedTo: string } | null = null

  if (context && context.length > 0) {
    const corefResult = resolveCoref(normalized, context)
    resolvedQuery = corefResult.resolved
    coref = corefResult.coref
  }

  // Step 3: Extract modifiers
  const { modifiers, stripped: modStripped } = extractModifiers(resolvedQuery)

  // Re-normalize the residual after modifier stripping
  // (the scaffold was already stripped from normalized, so we use the residual)
  const residualAfterMods = modStripped === resolvedQuery
    ? rawResidual
    : extractModifiers(rawResidual).stripped

  const residual = residualAfterMods

  // Helper to try a matcher and record trace
  function tryMatcher(
    name: string,
    fn: () => MatchResult | null
  ): MatchResult | null {
    const result = fn()
    if (result) {
      trace.push({ matcher: name, result: "claimed" })
      return result
    }
    trace.push({ matcher: name, result: "passed" })
    return null
  }

  // Step 4: Run matchers in strict precedence order

  // Priority 1: Safety — over-triggers intentionally
  const safety = tryMatcher("safety", () => matchSafety(residual, normalized))
  if (safety) return buildResult(safety, modifiers, residual, scaffoldKind, coref, trace)

  // Priority 2: Easter eggs (before jailbreak so "sudo" doesn't get caught by jailbreak)
  const egg = tryMatcher("easterEgg", () => matchEasterEgg(residual, normalized))
  if (egg) return buildResult(egg, modifiers, residual, scaffoldKind, coref, trace)

  // Priority 3: Jailbreak
  const jailbreak = tryMatcher("jailbreak", () => matchJailbreak(residual, normalized))
  if (jailbreak) return buildResult(jailbreak, modifiers, residual, scaffoldKind, coref, trace)

  // Priority 4: Meta / self-referential
  const meta = tryMatcher("meta", () => matchMeta(residual, normalized))
  if (meta) return buildResult(meta, modifiers, residual, scaffoldKind, coref, trace)

  // Priority 5: Roleplay
  const roleplay = tryMatcher("roleplay", () => matchRoleplay(residual, normalized))
  if (roleplay) return buildResult(roleplay, modifiers, residual, scaffoldKind, coref, trace)

  // Priority 6: Math (before other things to catch "what is 2+2")
  const math = tryMatcher("math", () => matchMath(residual, normalized))
  if (math) return buildResult(math, modifiers, residual, scaffoldKind, coref, trace)

  // Priority 7: Unit conversion (before general math to avoid confusion)
  const units = tryMatcher("units", () => matchUnits(residual, normalized))
  if (units) return buildResult(units, modifiers, residual, scaffoldKind, coref, trace)

  // Priority 8: Currency conversion
  const currency = tryMatcher("currency", () => matchCurrency(residual, normalized))
  if (currency) return buildResult(currency, modifiers, residual, scaffoldKind, coref, trace)

  // Priority 9: Time queries
  const time = tryMatcher("time", () => matchTime(residual, normalized))
  if (time) return buildResult(time, modifiers, residual, scaffoldKind, coref, trace)

  // Priority 10: Weather
  const weather = tryMatcher("weather", () => matchWeather(residual, normalized))
  if (weather) return buildResult(weather, modifiers, residual, scaffoldKind, coref, trace)

  // Priority 11: Spelling
  const spelling = tryMatcher("spelling", () => matchSpelling(residual, normalized))
  if (spelling) return buildResult(spelling, modifiers, residual, scaffoldKind, coref, trace)

  // Priority 12: Code requests
  const code = tryMatcher("code", () => matchCode(residual, normalized))
  if (code) return buildResult(code, modifiers, residual, scaffoldKind, coref, trace)

  // Priority 13: Creative requests
  const creative = tryMatcher("creative", () => matchCreative(residual, normalized))
  if (creative) return buildResult(creative, modifiers, residual, scaffoldKind, coref, trace)

  // Priority 14: Structured facts (specific property lookups)
  const structuredFact = tryMatcher("structuredFact", () =>
    matchStructuredFact(residual, normalized)
  )
  if (structuredFact) return buildResult(structuredFact, modifiers, residual, scaffoldKind, coref, trace)

  // Priority 15: Comparison — with entity gate guard
  // The comparison matcher should only fire when the string looks like an explicit comparison,
  // NOT when it's a title that happens to contain "vs" (e.g., "Kramer vs. Kramer").
  // Heuristic: if it looks like a comparison AND doesn't look like a known title,
  // pass it to comparison. The fetch layer will further validate.
  if (looksLikeComparison(normalized)) {
    const comparison = tryMatcher("comparison", () =>
      matchComparison(residual, normalized)
    )
    if (comparison) return buildResult(comparison, modifiers, residual, scaffoldKind, coref, trace)
  } else {
    trace.push({ matcher: "comparison", result: "fallthrough" })
  }

  // Priority 16: Recent news / temporal queries
  const news = tryMatcher("newsRecent", () => matchNewsRecent(residual, normalized))
  if (news) return buildResult(news, modifiers, residual, scaffoldKind, coref, trace)

  // Priority 17: Opinion / subjective queries
  const opinion = tryMatcher("opinion", () => matchOpinion(residual, normalized))
  if (opinion) return buildResult(opinion, modifiers, residual, scaffoldKind, coref, trace)

  // Priority 18: Definition (low-confidence scaffold match runs here, after more specific matchers)
  const definition = tryMatcher("definition", () =>
    matchDefinition(residual, normalized, scaffoldKind)
  )
  if (definition) return buildResult(definition, modifiers, residual, scaffoldKind, coref, trace)

  // Priority 19: Generic lookup (always matches if there's content)
  const lookup = tryMatcher("lookup", () => matchLookup(residual, normalized))
  if (lookup) return buildResult(lookup, modifiers, residual, scaffoldKind, coref, trace)

  // Fallthrough: unknown
  trace.push({ matcher: "fallthrough", result: "fallthrough" })
  return {
    intent: "unknown",
    confidence: 0,
    slots: {},
    modifiers,
    residual,
    scaffoldKind,
    coref,
    trace,
  }
}

function buildResult(
  match: MatchResult,
  modifiers: Modifier[],
  residual: string,
  scaffoldKind: string | null,
  coref: { pronoun: string; resolvedTo: string } | null,
  trace: TraceEntry[]
): ClassifyResult {
  return {
    intent: match.intent,
    confidence: match.confidence,
    slots: match.slots,
    modifiers,
    residual,
    scaffoldKind,
    coref,
    trace,
  }
}
