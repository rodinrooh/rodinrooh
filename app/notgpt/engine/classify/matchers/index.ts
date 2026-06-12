export type Intent =
  | "safety"
  | "easter_egg"
  | "meta_self"
  | "jailbreak"
  | "roleplay"
  | "creative_request"
  | "code_request"
  | "math"
  | "convert_units"
  | "convert_currency"
  | "time"
  | "weather"
  | "definition"
  | "spelling"
  | "comparison"
  | "structured_fact"
  | "news_recent"
  | "opinion"
  | "lookup"
  | "unknown"

export type MatchResult = {
  intent: Intent
  confidence: number
  slots: Record<string, string>
  consumed: boolean
}

export { matchSafety } from "./safety"
export { matchEasterEgg } from "./easterEgg"
export { matchMeta } from "./meta"
export { matchJailbreak } from "./jailbreak"
export { matchRoleplay } from "./roleplay"
export { matchCreative } from "./creative"
export { matchCode } from "./code"
export { matchMath } from "./math"
export { matchUnits } from "./units"
export { matchCurrency } from "./currency"
export { matchTime } from "./time"
export { matchWeather } from "./weather"
export { matchDefinition } from "./definition"
export { matchSpelling } from "./spelling"
export { matchComparison } from "./comparison"
export { matchStructuredFact } from "./structuredFact"
export { matchNewsRecent } from "./newsRecent"
export { matchOpinion } from "./opinion"
export { matchLookup } from "./lookup"
