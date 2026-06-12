export type Modifier =
  | { kind: "format"; value: "roman-numerals" | "binary" | "hex" | "words" | "scientific" | "percentage" }
  | { kind: "precision"; decimals: number }

export type ModifierResult = {
  modifiers: Modifier[]
  stripped: string // query with modifier phrases removed
}

const FORMAT_PATTERNS: Array<[RegExp, Modifier]> = [
  [/\s*\bin\s+roman\s+numerals?\b/i, { kind: "format", value: "roman-numerals" }],
  [/\s*\bin\s+binary\b/i, { kind: "format", value: "binary" }],
  [/\s*\bin\s+hex(?:adecimal)?\b/i, { kind: "format", value: "hex" }],
  [/\s*\bin\s+hexadecimal\b/i, { kind: "format", value: "hex" }],
  [/\s*\bin\s+words?\b/i, { kind: "format", value: "words" }],
  [/\s*\bin\s+scientific\s+notation\b/i, { kind: "format", value: "scientific" }],
  [/\s*\bas\s+a\s+percentage\b/i, { kind: "format", value: "percentage" }],
  [/\s*\bin\s+percent(?:age)?\b/i, { kind: "format", value: "percentage" }],
]

const PRECISION_PATTERN = /\s*\bto\s+(\d+)\s+decimal\s+places?\b/i

/**
 * Detects and extracts output modifiers from the query.
 * Returns the modifiers found and the query with those phrases removed.
 */
export function extractModifiers(query: string): ModifierResult {
  const modifiers: Modifier[] = []
  let stripped = query

  // Check for precision modifier
  const precMatch = PRECISION_PATTERN.exec(stripped)
  if (precMatch) {
    const decimals = parseInt(precMatch[1], 10)
    modifiers.push({ kind: "precision", decimals })
    stripped = stripped.replace(PRECISION_PATTERN, "").trim()
  }

  // Check for format modifiers
  for (const [pattern, modifier] of FORMAT_PATTERNS) {
    if (pattern.test(stripped)) {
      // Avoid duplicate format modifiers
      const alreadyHas = modifiers.some(
        (m) => m.kind === "format" && "value" in m && m.value === (modifier as Extract<Modifier, { kind: "format" }>).value
      )
      if (!alreadyHas) {
        modifiers.push(modifier)
      }
      stripped = stripped.replace(pattern, "").trim()
    }
  }

  // Clean up any trailing/leading whitespace and multiple spaces
  stripped = stripped.replace(/\s+/g, " ").trim()

  return { modifiers, stripped }
}
