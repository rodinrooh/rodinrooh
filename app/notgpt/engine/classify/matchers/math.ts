import * as mathjs from "mathjs"
import { MatchResult } from "./index"

// Create a restricted math instance
const math = mathjs.create(mathjs.all)

// Disable dangerous/stateful operations
math.import(
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    import: () => { throw new Error("blocked") },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createUnit: () => { throw new Error("blocked") },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    evaluate: undefined as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parse: undefined as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    simplify: undefined as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    derivative: undefined as any,
  },
  { override: true }
)

// Phrases to strip before attempting math parse
const MATH_PREFIXES = [
  /^(?:what\s+is\s+|calculate\s+|compute\s+|evaluate\s+|solve\s+|what(?:'s|\s+is)\s+|whats\s+)/i,
  /^(?:how\s+much\s+is\s+|what\s+does\s+.+?\s+equal\s*\??$)/i,
]

// Must have at least one operator or function call to be considered math
// (avoids matching bare numbers like "42")
const OPERATOR_PATTERN = /[+\-*/^%]|(?:\b(?:sqrt|sin|cos|tan|log|ln|abs|floor|ceil|round|pow|mod|exp|pi|e)\b)/i

// Strip common question words and suffixes
function stripMathScaffold(text: string): string {
  let s = text

  for (const prefix of MATH_PREFIXES) {
    s = s.replace(prefix, "").trim()
  }

  // Strip trailing "=" or "?" or "= ?"
  s = s.replace(/\s*=\s*\??$/, "").trim()
  s = s.replace(/\?$/, "").trim()

  // Replace common words with math equivalents
  s = s
    .replace(/\bplus\b/gi, "+")
    .replace(/\bminus\b/gi, "-")
    .replace(/\btimes\b/gi, "*")
    .replace(/\bmultiplied\s+by\b/gi, "*")
    .replace(/\bdivided\s+by\b/gi, "/")
    .replace(/\bover\b/gi, "/")
    .replace(/\bto\s+the\s+power\s+of\b/gi, "^")
    .replace(/\bsquared\b/gi, "^2")
    .replace(/\bcubed\b/gi, "^3")
    .replace(/\bsquare\s+root\s+of\b/gi, "sqrt(")
    .replace(/\bpercent\s+of\b/gi, "/ 100 *")
    .replace(/\bmod(?:ulo)?\b/gi, "%")
    .replace(/\bx\b/gi, "*")  // common multiplication
    .replace(/(\d)\s*x\s*(\d)/gi, "$1 * $2")  // "3 x 4" → "3 * 4"

  return s.trim()
}

// Check if the expression contains at least one real operator/function
function hasOperator(expr: string): boolean {
  return OPERATOR_PATTERN.test(expr)
}

// Format the result cleanly
function formatResult(result: mathjs.MathType): string {
  if (typeof result === "number") {
    if (!isFinite(result)) return String(result)
    // Avoid floating point noise: round to 10 sig figs
    const rounded = parseFloat(result.toPrecision(10))
    return String(rounded)
  }
  if (typeof result === "string") return result
  if (result && typeof result === "object" && "toString" in result) {
    return result.toString()
  }
  return String(result)
}

/**
 * Math expression matcher.
 * Strips question scaffolding, attempts to evaluate with mathjs.
 * Returns null if parse/evaluate fails or if expression has no operators.
 */
export function matchMath(
  residual: string,
  normalized: string
): MatchResult | null {
  // Try both the residual and normalized
  const candidates = [residual, normalized]

  for (const candidate of candidates) {
    const stripped = stripMathScaffold(candidate)

    if (!stripped || stripped.length === 0) continue
    if (!hasOperator(stripped)) continue

    // Handle potential unclosed parens from "square root of" replacement
    const balanced = stripped.endsWith("(") ? stripped.slice(0, -1) : stripped

    try {
      // Use mathjs.evaluate (the module-level safe one, not the instance method we cleared)
      // We use the math instance's compile + evaluate pattern
      const node = math.parse(balanced)
      const result = node.evaluate()

      // Reject if result is not a simple value (e.g., a matrix or unit when not requested)
      if (result === undefined || result === null) continue

      // Reject function nodes, complex arrays as top-level results for simple queries
      const resultStr = formatResult(result as mathjs.MathType)

      if (resultStr === "[object Object]" || resultStr.startsWith("function")) continue

      return {
        intent: "math",
        confidence: 0.97,
        slots: {
          expression: stripped,
          result: resultStr,
        },
        consumed: true,
      }
    } catch {
      // Parse or eval failed — try next candidate
      continue
    }
  }

  return null
}
