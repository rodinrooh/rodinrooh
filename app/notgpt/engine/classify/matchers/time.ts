import { MatchResult } from "./index"

// "What time is it in [location]"
const TIME_IN_LOCATION_PATTERN =
  /(?:what\s+(?:is\s+the\s+)?time\s+(?:is\s+it\s+)?(?:right\s+now\s+)?in|current\s+time\s+in|time\s+in|time\s+(?:right\s+now\s+)?in)\s+(.+)$/i

// "What time is it" (no location)
const TIME_NOW_PATTERN =
  /(?:^|\b)(?:what\s+(?:is\s+)?(?:the\s+)?(?:current\s+)?time(?:\s+is\s+it)?(?:\s+right\s+now)?|current\s+time|time\s+right\s+now|what\s+time\s+is\s+it)(?:\s+right\s+now)?\s*[?.]*$/i

// "Days until [date/event]"
const DAYS_UNTIL_PATTERN =
  /^(?:how\s+many\s+days?\s+(?:until|till|to|before|left\s+(?:until|till|to))\s+|days?\s+(?:until|till|to)\s+)(.+)$/i

// "What day is [date]" / "what day of the week is [date]"
const WHAT_DAY_PATTERN =
  /^what\s+(?:day(?:\s+of\s+the\s+week)?\s+(?:is|was|will\s+be)|is\s+the\s+day\s+(?:of\s+the\s+week\s+on|on))\s+(.+)$/i

// "What is today's date" / "What day is today" / "today's date"
const TODAY_DATE_PATTERN =
  /(?:^|\b)(?:what\s+(?:is\s+)?today['']s?\s+date|what\s+(?:is\s+)?the\s+(?:date\s+)?today|today['']s?\s+date|what\s+is\s+today|what\s+day\s+is\s+(?:it\s+)?today|today'?s\s+date)\s*[?.]*$/i

/**
 * Time / date matcher.
 * Handles: current time (with or without location), days until, what day is X, today's date.
 */
export function matchTime(
  residual: string,
  normalized: string
): MatchResult | null {
  // Today's date query
  if (TODAY_DATE_PATTERN.test(normalized)) {
    return {
      intent: "time",
      confidence: 0.95,
      slots: {
        subintent: "current-time",
        location: "",
      },
      consumed: true,
    }
  }

  // Time in a specific location
  const locationMatch = TIME_IN_LOCATION_PATTERN.exec(normalized)
  if (locationMatch) {
    return {
      intent: "time",
      confidence: 0.95,
      slots: {
        subintent: "current-time",
        location: locationMatch[1].trim(),
      },
      consumed: true,
    }
  }

  // Current time (no location)
  if (TIME_NOW_PATTERN.test(normalized)) {
    return {
      intent: "time",
      confidence: 0.95,
      slots: {
        subintent: "current-time",
        location: "",
      },
      consumed: true,
    }
  }

  // Days until X
  const daysUntilMatch = DAYS_UNTIL_PATTERN.exec(normalized)
  if (daysUntilMatch) {
    return {
      intent: "time",
      confidence: 0.93,
      slots: {
        subintent: "days-until",
        target: daysUntilMatch[1].trim(),
        location: "",
      },
      consumed: true,
    }
  }

  // What day is X
  const whatDayMatch = WHAT_DAY_PATTERN.exec(normalized)
  if (whatDayMatch) {
    return {
      intent: "time",
      confidence: 0.93,
      slots: {
        subintent: "what-day",
        target: whatDayMatch[1].trim(),
        location: "",
      },
      consumed: true,
    }
  }

  return null
}
