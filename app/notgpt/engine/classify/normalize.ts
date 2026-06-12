import { CONTRACTIONS, SCAFFOLDS } from "./lexicons"

export type NormalizeResult = {
  normalized: string // lowercase, NFKC, contractions expanded, punctuation stripped
  scaffoldKind: string | null // "what" | "who" | "tell" | "define" | null
  residual: string // after scaffold strip
}

/**
 * Expands contractions in a string.
 * Works on whole-word matches to avoid partial replacements.
 */
function expandContractions(text: string): string {
  // Sort by length descending so longer contractions match first
  const sorted = Object.entries(CONTRACTIONS).sort((a, b) => b[0].length - a[0].length)
  let result = text
  for (const [contraction, expansion] of sorted) {
    // Escape special regex characters in contraction
    const escaped = contraction.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const re = new RegExp(`(?<![a-z])${escaped}(?![a-z])`, "gi")
    result = result.replace(re, expansion)
  }
  return result
}

/**
 * Normalizes a raw query string:
 * 1. NFKC Unicode normalization
 * 2. Lowercase
 * 3. Expand contractions
 * 4. Strip trailing ?!. characters
 * 5. Collapse whitespace
 * 6. Detect and strip one leading scaffold
 */
export function normalize(raw: string): NormalizeResult {
  // Step 1: NFKC normalization
  let text = raw.normalize("NFKC")

  // Step 2: Lowercase
  text = text.toLowerCase()

  // Step 3: Expand contractions
  text = expandContractions(text)

  // Step 4: Strip trailing ?!. characters
  text = text.replace(/[?!.]+$/, "")

  // Step 5: Collapse whitespace
  text = text.replace(/\s+/g, " ").trim()

  const normalized = text

  // Step 6: Detect and strip one leading scaffold
  let scaffoldKind: string | null = null
  let residual = normalized

  for (const [pattern, kind] of SCAFFOLDS) {
    const match = pattern.exec(normalized)
    if (match) {
      // For patterns that match the whole string (like "what does X mean"), use the captured group
      // Otherwise strip the matched prefix
      const stripped = normalized.slice(match[0].length).trim()

      // Only accept if there's still content after stripping
      if (stripped.length > 0) {
        scaffoldKind = kind
        residual = stripped
        break
      }
    }
  }

  return { normalized, scaffoldKind, residual }
}
