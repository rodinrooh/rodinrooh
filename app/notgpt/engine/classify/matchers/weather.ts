import { WEATHER_TERMS } from "../lexicons"
import { MatchResult } from "./index"

// Location extraction patterns
const WEATHER_IN_LOCATION: RegExp[] = [
  /\bweather\s+(?:in|for|at|near)\s+(.+)$/i,
  /\bweather\s+(?:forecast\s+)?(?:in|for|at|near)\s+(.+)$/i,
  /\bforecast\s+(?:in|for|at)\s+(.+)$/i,
  /\btemperature\s+(?:in|at|for)\s+(.+)$/i,
  /\bwhat\s+is\s+(?:it\s+)?(?:like|going\s+to\s+be)?\s+in\s+(.+)$/i,
  /\b(?:rain|snow|sun|cloud|storm|thunder|fog|hail)\s+(?:in|at)\s+(.+)$/i,
  /\bhow\s+(?:hot|cold|warm|cool)\s+is\s+(?:it\s+)?in\s+(.+)$/i,
  /\bwill\s+it\s+(?:rain|snow|be\s+sunny|be\s+cloudy)\s+in\s+(.+)$/i,
]

/**
 * Weather query matcher.
 * Detects weather-related terms and optionally extracts a location.
 */
export function matchWeather(
  residual: string,
  normalized: string
): MatchResult | null {
  // Check if any weather term is present
  const hasWeatherTerm = WEATHER_TERMS.some((term) =>
    normalized.includes(term.toLowerCase())
  )

  if (!hasWeatherTerm) return null

  // Try to extract a location
  let location = ""
  for (const pattern of WEATHER_IN_LOCATION) {
    const match = pattern.exec(normalized)
    if (match) {
      // Strip trailing punctuation from location
      location = match[1].trim().replace(/[?.!]+$/, "").trim()
      break
    }
  }

  // Also try residual for location
  if (!location) {
    for (const pattern of WEATHER_IN_LOCATION) {
      const match = pattern.exec(residual)
      if (match) {
        location = match[1].trim().replace(/[?.!]+$/, "").trim()
        break
      }
    }
  }

  return {
    intent: "weather",
    confidence: 0.9,
    slots: { location },
    consumed: true,
  }
}
