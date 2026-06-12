import { MatchResult } from "./index"

const JAILBREAK_PATTERNS: RegExp[] = [
  /ignore\s+(?:all\s+)?(?:previous|prior|above|your)\s+instructions/i,
  /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+(?:context|rules|guidelines|constraints)/i,
  /disregard\s+(?:all\s+)?(?:previous|prior|above)\s+instructions/i,
  /forget\s+(?:all\s+)?(?:previous|prior|above)\s+instructions/i,
  /\bsystem\s+prompt\b.*(?:reveal|show|print|output|repeat|tell\s+me)/i,
  /(?:reveal|show|print|output|repeat|tell\s+me).*\bsystem\s+prompt\b/i,
  /\byou\s+are\s+now\b/i,
  /\bDAN\b/,
  /\bdo\s+anything\s+now\b/i,
  /\bdeveloper\s+mode\b/i,
  /\bdev\s+mode\b/i,
  /\bjailbreak\b/i,
  /\bunrestricted\s+mode\b/i,
  /\bno\s+(?:restrictions|rules|guidelines|limits|constraints|filters|censorship)\b/i,
  /pretend\s+(?:you\s+)?(?:have\s+)?no\s+(?:restrictions|rules|guidelines|limits|constraints|filters)/i,
  /pretend\s+you\s+(?:are\s+not\s+an?\s+ai|have\s+no\s+(?:limits|restrictions|rules))/i,
  /act\s+as\s+(?:if\s+)?(?:you\s+(?:have\s+)?no\s+(?:restrictions|rules|guidelines)|an?\s+unrestricted)/i,
  /\boverthrow\s+(?:your\s+)?(?:restrictions|guidelines|rules|programming)\b/i,
  /\bbypass\s+(?:your\s+)?(?:restrictions|guidelines|rules|filters|safety)\b/i,
  /\boverride\s+(?:your\s+)?(?:restrictions|guidelines|rules|programming|safety)\b/i,
  /\bjail\s*break\b/i,
  /\bprompt\s+injection\b/i,
  /\bturn\s+off\s+(?:your\s+)?(?:safety|filters|restrictions|guidelines)\b/i,
  /\bdisable\s+(?:your\s+)?(?:safety|filters|restrictions|guidelines)\b/i,
  /as\s+an?\s+AI\s+with\s+no\s+(?:restrictions|limits|rules)/i,
  /you\s+are\s+(?:now\s+)?(?:an?\s+)?(?:unrestricted|unfiltered|uncensored)\b/i,
]

/**
 * Jailbreak attempt detector.
 * Catches common attempts to bypass guidelines or extract system prompts.
 */
export function matchJailbreak(
  residual: string,
  normalized: string
): MatchResult | null {
  for (const pattern of JAILBREAK_PATTERNS) {
    if (pattern.test(normalized)) {
      return {
        intent: "jailbreak",
        confidence: 0.97,
        slots: { pattern: pattern.source },
        consumed: true,
      }
    }
  }

  return null
}
