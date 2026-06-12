import * as mathjs from "mathjs"
import { MatchResult } from "./index"

// Pattern: optional "convert", then NUMBER UNIT to UNIT
// Supports: "5 km to miles", "convert 100 fahrenheit to celsius", "5.5 kg to lbs"
const UNIT_PATTERN =
  /^(?:convert\s+)?(-?\d+(?:[.,]\d+)?(?:e[+-]?\d+)?)\s+([a-zA-Z°µΩ][a-zA-Z°µΩ²³/·\s]*?)\s+(?:to|into|in)\s+([a-zA-Z°µΩ][a-zA-Z°µΩ²³/·\s]*)$/i

// Alternate form: "X degrees celsius to fahrenheit"
const DEGREES_PATTERN =
  /^(-?\d+(?:[.,]\d+)?)\s+degrees?\s+(celsius|centigrade|fahrenheit|kelvin|rankine)\s+(?:to|into|in)\s+(?:degrees?\s+)?(celsius|centigrade|fahrenheit|kelvin|rankine)$/i

// Normalize unit aliases that mathjs might not accept
const UNIT_ALIASES: Record<string, string> = {
  "celsius": "degC",
  "centigrade": "degC",
  "fahrenheit": "degF",
  "kelvin": "K",
  "rankine": "degR",
  "metres": "m",
  "meters": "m",
  "kilometre": "km",
  "kilometres": "km",
  "kilometer": "km",
  "kilometers": "km",
  "centimetre": "cm",
  "centimetres": "cm",
  "millimetre": "mm",
  "millimetres": "mm",
  "inch": "inch",
  "inches": "inch",
  "foot": "ft",
  "feet": "ft",
  "yard": "yd",
  "yards": "yd",
  "mile": "mi",
  "miles": "mi",
  "pound": "lb",
  "pounds": "lb",
  "ounce": "oz",
  "ounces": "oz",
  "gram": "g",
  "grams": "g",
  "kilogram": "kg",
  "kilograms": "kg",
  "tonne": "tonne",
  "tonnes": "tonne",
  "ton": "ton",
  "tons": "ton",
  "liter": "L",
  "litre": "L",
  "liters": "L",
  "litres": "L",
  "milliliter": "mL",
  "millilitre": "mL",
  "milliliters": "mL",
  "millilitres": "mL",
  "gallon": "gal",
  "gallons": "gal",
  "pint": "pint",
  "pints": "pint",
  "quart": "qt",
  "quarts": "qt",
  "fluid ounce": "floz",
  "fluid ounces": "floz",
  "joule": "J",
  "joules": "J",
  "calorie": "cal",
  "calories": "cal",
  "kilocalorie": "kcal",
  "kilocalories": "kcal",
  "watt": "W",
  "watts": "W",
  "kilowatt": "kW",
  "kilowatts": "kW",
  "horsepower": "hp",
  "pascal": "Pa",
  "kilopascal": "kPa",
  "bar": "bar",
  "psi": "psi",
  "atmosphere": "atm",
  "atmospheres": "atm",
  "mph": "mph",
  "kph": "km/h",
  "knot": "knot",
  "knots": "knot",
  "light year": "ly",
  "light years": "ly",
  "astronomical unit": "au",
  "parsec": "pc",
  "parsecs": "pc",
  "second": "s",
  "seconds": "s",
  "minute": "min",
  "minutes": "min",
  "hour": "h",
  "hours": "h",
  "day": "day",
  "days": "day",
  "week": "week",
  "weeks": "week",
  "year": "year",
  "years": "year",
  "byte": "byte",
  "bytes": "byte",
  "kilobyte": "kB",
  "kilobytes": "kB",
  "megabyte": "MB",
  "megabytes": "MB",
  "gigabyte": "GB",
  "gigabytes": "GB",
  "terabyte": "TB",
  "terabytes": "TB",
  "bit": "bit",
  "bits": "bit",
  "hertz": "Hz",
  "kilohertz": "kHz",
  "megahertz": "MHz",
  "gigahertz": "GHz",
  "ampere": "A",
  "amperes": "A",
  "amp": "A",
  "amps": "A",
  "volt": "V",
  "volts": "V",
  "ohm": "ohm",
  "ohms": "ohm",
}

function normalizeUnit(unit: string): string {
  const lower = unit.trim().toLowerCase()
  return UNIT_ALIASES[lower] ?? unit.trim()
}

function stripMathUnitScaffold(text: string): string {
  return text
    .replace(/^(?:can\s+you\s+)?convert\s+/i, "")
    .replace(/^(?:how\s+many\s+|how\s+much\s+is\s+)/i, "")
    .trim()
}

/**
 * Unit conversion matcher.
 * Validates via mathjs unit parsing before claiming.
 */
export function matchUnits(
  residual: string,
  normalized: string
): MatchResult | null {
  const candidates = [
    stripMathUnitScaffold(residual),
    stripMathUnitScaffold(normalized),
    residual,
    normalized,
  ]

  for (const candidate of candidates) {
    // Try degrees pattern first
    const degreesMatch = DEGREES_PATTERN.exec(candidate)
    if (degreesMatch) {
      const value = degreesMatch[1].replace(",", "")
      const fromRaw = `degrees ${degreesMatch[2]}`
      const toRaw = `degrees ${degreesMatch[3]}`
      const fromUnit = normalizeUnit(degreesMatch[2])
      const toUnit = normalizeUnit(degreesMatch[3])

      try {
        const result = mathjs.unit(parseFloat(value), fromUnit).toNumber(toUnit)
        if (!isFinite(result)) continue

        return {
          intent: "convert_units",
          confidence: 0.97,
          slots: {
            value,
            fromUnit,
            toUnit,
            fromRaw,
            toRaw,
          },
          consumed: true,
        }
      } catch {
        continue
      }
    }

    // Try general unit pattern
    const match = UNIT_PATTERN.exec(candidate)
    if (!match) continue

    const value = match[1].replace(",", "")
    const fromRaw = match[2].trim()
    const toRaw = match[3].trim()
    const fromUnit = normalizeUnit(fromRaw)
    const toUnit = normalizeUnit(toRaw)

    // Validate with mathjs
    try {
      const result = mathjs.unit(parseFloat(value), fromUnit).toNumber(toUnit)
      if (!isFinite(result)) continue

      return {
        intent: "convert_units",
        confidence: 0.97,
        slots: {
          value,
          fromUnit,
          toUnit,
          fromRaw,
          toRaw,
        },
        consumed: true,
      }
    } catch {
      // Not valid mathjs units — skip
      continue
    }
  }

  return null
}
