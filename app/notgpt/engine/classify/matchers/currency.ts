import { CRYPTO_SYMBOLS } from "../lexicons"
import { MatchResult } from "./index"

// Fiat currency codes (ISO 4217 subset — common ones)
const FIAT_CODES = new Set([
  "usd", "eur", "gbp", "jpy", "cad", "aud", "chf", "cny", "hkd", "nzd",
  "sek", "nok", "dkk", "sgd", "inr", "mxn", "brl", "zar", "rub", "krw",
  "try", "aed", "sar", "idr", "myr", "php", "thb", "vnd", "pln", "czk",
  "huf", "ron", "bgn", "hrk", "isk", "ils", "cop", "pen", "clp", "ars",
  "egp", "pkr", "bdt", "uah", "kwd", "qar", "omr", "bhd", "jod", "lkr",
])

// Currency name aliases → ISO code
const CURRENCY_NAMES: Record<string, string> = {
  "dollar": "USD",
  "dollars": "USD",
  "us dollar": "USD",
  "us dollars": "USD",
  "american dollar": "USD",
  "american dollars": "USD",
  "usd": "USD",
  "euro": "EUR",
  "euros": "EUR",
  "eur": "EUR",
  "pound": "GBP",
  "pounds": "GBP",
  "british pound": "GBP",
  "british pounds": "GBP",
  "sterling": "GBP",
  "gbp": "GBP",
  "yen": "JPY",
  "japanese yen": "JPY",
  "jpy": "JPY",
  "yuan": "CNY",
  "renminbi": "CNY",
  "rmb": "CNY",
  "cny": "CNY",
  "rupee": "INR",
  "rupees": "INR",
  "indian rupee": "INR",
  "inr": "INR",
  "ruble": "RUB",
  "roubles": "RUB",
  "rub": "RUB",
  "won": "KRW",
  "krw": "KRW",
  "real": "BRL",
  "reais": "BRL",
  "brl": "BRL",
  "franc": "CHF",
  "francs": "CHF",
  "swiss franc": "CHF",
  "chf": "CHF",
  "peso": "MXN",
  "pesos": "MXN",
  "mxn": "MXN",
  "rand": "ZAR",
  "zar": "ZAR",
  "lira": "TRY",
  "try": "TRY",
  "canadian dollar": "CAD",
  "canadian dollars": "CAD",
  "cad": "CAD",
  "australian dollar": "AUD",
  "australian dollars": "AUD",
  "aud": "AUD",
  "dirham": "AED",
  "dirhams": "AED",
  "aed": "AED",
  "riyal": "SAR",
  "riyals": "SAR",
  "sar": "SAR",
  "shekel": "ILS",
  "shekels": "ILS",
  "ils": "ILS",
  "krona": "SEK",
  "kronor": "SEK",
  "sek": "SEK",
  "krone": "NOK",
  "kroner": "NOK",
  "nok": "NOK",
  "dkk": "DKK",
  "hkd": "HKD",
  "hong kong dollar": "HKD",
  "sgd": "SGD",
  "singapore dollar": "SGD",
}

// Crypto name → canonical symbol (uppercase)
const CRYPTO_MAP: Record<string, string> = {}
for (const sym of CRYPTO_SYMBOLS) {
  CRYPTO_MAP[sym.toLowerCase()] = sym.toUpperCase()
}
// Override with canonical names
const CRYPTO_CANONICAL: Record<string, string> = {
  "bitcoin": "BTC",
  "btc": "BTC",
  "ethereum": "ETH",
  "eth": "ETH",
  "solana": "SOL",
  "sol": "SOL",
  "dogecoin": "DOGE",
  "doge": "DOGE",
  "ripple": "XRP",
  "xrp": "XRP",
  "bnb": "BNB",
  "cardano": "ADA",
  "ada": "ADA",
  "avalanche": "AVAX",
  "avax": "AVAX",
  "polkadot": "DOT",
  "dot": "DOT",
  "polygon": "MATIC",
  "matic": "MATIC",
  "chainlink": "LINK",
  "link": "LINK",
  "litecoin": "LTC",
  "ltc": "LTC",
  "shib": "SHIB",
  "shiba inu": "SHIB",
  "tron": "TRX",
  "trx": "TRX",
  "stellar": "XLM",
  "xlm": "XLM",
}
Object.assign(CRYPTO_MAP, CRYPTO_CANONICAL)

function normalizeCurrency(raw: string): { code: string; isCrypto: boolean } | null {
  const lower = raw.trim().toLowerCase()

  if (CRYPTO_MAP[lower]) {
    return { code: CRYPTO_MAP[lower], isCrypto: true }
  }

  if (CURRENCY_NAMES[lower]) {
    return { code: CURRENCY_NAMES[lower], isCrypto: false }
  }

  const upper = lower.toUpperCase()
  if (FIAT_CODES.has(lower)) {
    return { code: upper, isCrypto: false }
  }

  return null
}

// Currency conversion patterns
// "N USD to EUR", "convert N dollars to euros", "100 bitcoin in usd"
const CURRENCY_PATTERN =
  /^(?:convert\s+)?(-?\d+(?:[.,]\d+)?(?:e[+-]?\d+)?(?:\s*(?:million|billion|thousand|k|m|b))?)\s+(.+?)\s+(?:to|into|in)\s+(.+)$/i

const AMOUNT_MULTIPLIERS: Record<string, number> = {
  "k": 1_000,
  "thousand": 1_000,
  "m": 1_000_000,
  "million": 1_000_000,
  "b": 1_000_000_000,
  "billion": 1_000_000_000,
}

function parseAmount(raw: string): number {
  const lower = raw.trim().toLowerCase()
  const multiplierMatch = /([kmb]|thousand|million|billion)$/.exec(lower)
  if (multiplierMatch) {
    const suffix = multiplierMatch[1]
    const base = parseFloat(lower.replace(multiplierMatch[0], "").replace(",", "").trim())
    return base * (AMOUNT_MULTIPLIERS[suffix] ?? 1)
  }
  return parseFloat(lower.replace(",", ""))
}

/**
 * Currency conversion matcher.
 * Handles fiat and crypto. Detects "convert N X to Y" patterns.
 */
export function matchCurrency(
  residual: string,
  normalized: string
): MatchResult | null {
  const candidates = [normalized, residual]

  for (const candidate of candidates) {
    const match = CURRENCY_PATTERN.exec(candidate)
    if (!match) continue

    const amountRaw = match[1]
    const fromRaw = match[2].trim()
    const toRaw = match[3].trim()

    const fromNorm = normalizeCurrency(fromRaw)
    const toNorm = normalizeCurrency(toRaw)

    if (!fromNorm || !toNorm) continue

    const amount = parseAmount(amountRaw)
    if (isNaN(amount)) continue

    const isCrypto = fromNorm.isCrypto || toNorm.isCrypto

    return {
      intent: "convert_currency",
      confidence: 0.95,
      slots: {
        amount: String(amount),
        from: fromNorm.code,
        to: toNorm.code,
        isCrypto: String(isCrypto),
      },
      consumed: true,
    }
  }

  return null
}
