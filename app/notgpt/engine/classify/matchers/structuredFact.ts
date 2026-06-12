import { STRUCTURED_FACT_TEMPLATES } from "../lexicons"
import { MatchResult } from "./index"

/**
 * Structured fact matcher.
 * Iterates over STRUCTURED_FACT_TEMPLATES and returns the first match.
 * Provides entity name and Wikidata property IDs for the fetch layer.
 */
export function matchStructuredFact(
  residual: string,
  normalized: string
): MatchResult | null {
  const candidates = [normalized, residual]

  for (const candidate of candidates) {
    for (const template of STRUCTURED_FACT_TEMPLATES) {
      const match = template.pattern.exec(candidate)
      if (match) {
        const entity = match[template.entityGroup]?.trim().replace(/[?.!]+$/, "").trim()
        if (!entity || entity.length === 0) continue

        return {
          intent: "structured_fact",
          confidence: 0.9,
          slots: {
            entity,
            property: template.label,
            wikidata_properties: template.properties.join(","),
          },
          consumed: true,
        }
      }
    }
  }

  return null
}
