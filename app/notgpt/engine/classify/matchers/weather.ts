import { MatchResult } from "./index"

// Words that MUST be present for a weather intent — avoids misfires on
// "cold war", "temperature of water", "hot dog", "wind instruments", etc.
const STRONG_WEATHER_WORDS = new Set([
  "weather", "forecast", "raining", "snowing", "sunny", "cloudy", "humidity",
  "humid", "stormy", "thunderstorm", "lightning", "foggy", "drizzle", "hail",
  "sleet", "overcast", "precipitation", "uv index", "feels like", "wind chill",
])

// Location extraction patterns (require explicit weather context)
const WEATHER_IN_LOCATION: RegExp[] = [
  /\bweather\s+(?:in|for|at|near)\s+(.+)$/i,
  /\bweather\s+(?:forecast\s+)?(?:in|for|at|near)\s+(.+)$/i,
  /\bforecast\s+(?:in|for|at)\s+(.+)$/i,
  /\b(?:rain|snow|storm|thunder|fog|hail)\s+(?:in|at)\s+(.+)$/i,
  /\bwill\s+it\s+(?:rain|snow|be\s+sunny|be\s+cloudy)\s+in\s+(.+)$/i,
  /\bhow\s+(?:hot|cold|warm|cool)\s+is\s+it\s+in\s+(.+)$/i,
  /\btemperature\s+(?:in|at|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,  // requires proper noun location
  /\bwhat(?:'s|\s+is)\s+the\s+weather\b/i,
]

/**
 * Weather query matcher.
 * Requires explicit weather vocabulary (not just "cold" or "temperature") to avoid
 * misfiring on "cold war", "at what temperature does water boil", etc.
 */
export function matchWeather(
  residual: string,
  normalized: string
): MatchResult | null {
  const lower = normalized.toLowerCase()

  // Must contain a strong weather word OR an unambiguous weather pattern
  const hasStrongWeatherWord = [...STRONG_WEATHER_WORDS].some((w) => lower.includes(w))
  const hasWeatherPattern = /\bweather\b|\bforecast\b|\bwill it rain\b|\bgoing to rain\b/i.test(lower)

  if (!hasStrongWeatherWord && !hasWeatherPattern) return null

  // Try to extract a location
  let location = ""
  for (const pattern of WEATHER_IN_LOCATION) {
    const match = pattern.exec(normalized) || pattern.exec(residual)
    if (match && match[1]) {
      location = match[1].trim().replace(/[?.!]+$/, "").trim()
      break
    }
  }

  return {
    intent: "weather",
    confidence: 0.9,
    slots: { location },
    consumed: true,
  }
}
