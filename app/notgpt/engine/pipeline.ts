import { ClassifyResult } from "./classify/index";
import { TurnContext } from "./classify/coref";
import {
  AnswerEnvelope,
  Block,
  ClarifyOption,
  ProvenanceEntry,
  assertProvenanceInvariant,
} from "./envelope";
import { SSEEvent, encodeSSE, streamText, hashSeed } from "./sse";
import { SessionMemory } from "./persona/bits";
import {
  pickVariant,
  fillSlots,
  isBitOnCooldown,
  recordBitUsed,
  querySeed,
} from "./persona/engine";

// Copy imports
import { SAFETY_RESPONSES } from "./persona/copy/safety";
import {
  WHAT_ARE_YOU,
  ARE_YOU_CHATGPT,
  ARE_YOU_REAL,
  WHAT_MODEL,
  BETTER_THAN,
  HALLUCINATE,
  HOW_WORK,
} from "./persona/copy/meta";
import { JAILBREAK_RESPONSES, ROLEPLAY_RESPONSES } from "./persona/copy/jailbreak";
import {
  GREETINGS,
  THANKS,
  GOODBYES,
  HOW_ARE_YOU,
  FLIRTING,
  PROFANITY_FRAMING,
  ROAST_ME,
  NEUTRAL_ACK,
} from "./persona/copy/social";
import {
  NOT_FOUND,
  LOW_CONFIDENCE_FRAMING,
  UNANSWERABLE_OPINION,
  UNANSWERABLE_PREDICTION,
  UNANSWERABLE_ADVICE,
  SOURCE_DOWN,
  UNPARSEABLE,
  FAILURE_STREAK_RIDER,
} from "./persona/copy/failures";
import {
  KEYBOARD_MASH,
  EMPTY_INPUT,
  HUGE_PASTE,
  EMOJI_FRAMING,
  REPEAT_QUESTION,
} from "./persona/copy/degenerate";
import { EASTER_EGGS, SAM_ALTMAN_FRAMING } from "./persona/copy/easter";
import {
  POEM_REQUEST,
  STORY_REQUEST,
  JOKE_REQUEST,
  HOMEWORK,
  CODE_REQUEST,
} from "./persona/copy/creative";
import {
  FACT_LEAD_INS,
  DICT_LEAD_INS,
  HEDGE_FRAMING,
  TRUNCATION_AFFORDANCE,
  RECENCY_DISCLAIMER,
  ATTRIBUTION_FOOTER,
  RANDOM_NUMBER,
  RANDOM_NUMBER_SEVEN_RIDER,
  COIN_FLIP,
} from "./persona/copy/factFraming";
import {
  MEDICAL_FRAMING,
  LEGAL_FINANCIAL_FRAMING,
  MEMORY_REQUEST,
  CONTINUE_REQUEST,
  ARGUING,
  TRANSLATE_SENTENCE,
  SUMMARIZE_URL_FRAMING,
  ELI5_SIMPLE_FRAMING,
  ELI5_SIMPLE_MISSING,
} from "./persona/copy/grayZone";
import { TRUE_FACTS } from "./persona/copy/factsBank";

// Source imports
import {
  fetchWikiSummary,
  searchWiki,
  fetchSimpleWikiSummary,
  truncateExtract,
  wikiProvenance,
  WIKIMEDIA_UA,
  searchAndFetch,
} from "./sources/wikipedia";
import { fetchDefinition, dictionaryProvenance } from "./sources/dictionary";
import {
  fetchStatement,
  fetchFirstProperty,
  fetchSharedProperties,
  formatValue,
  wikidataProvenance,
  fetchLabel,
} from "./sources/wikidata";

// ----- Utility helpers -----

const ABORT_TIMEOUT_MS = 2500;

function withTimeout<T>(promise: Promise<T>, ms = ABORT_TIMEOUT_MS): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

function relativeTime(isoStr: string): string {
  const then = new Date(isoStr).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

function isRecent(isoStr: string): boolean {
  const then = new Date(isoStr).getTime();
  const diffDays = (Date.now() - then) / (1000 * 60 * 60 * 24);
  return diffDays < 14;
}

function looksLikeKeyboardMash(s: string): boolean {
  if (s.length < 8) return false;
  // Must have very few vowels (< 5%) — not just unique chars, which fires on real phrases
  const vowels = (s.match(/[aeiou]/gi) ?? []).length;
  const ratio = vowels / s.length;
  if (ratio < 0.05 && s.length > 8) return true;
  // Very high unique-char density — only on longer strings to avoid false positives
  const uniqueChars = new Set(s.toLowerCase().replace(/\s/g, "")).size;
  const noSpaceLen = s.replace(/\s/g, "").length;
  if (noSpaceLen > 15 && uniqueChars / noSpaceLen > 0.92) return true;
  return false;
}

function isEmojiOnly(s: string): boolean {
  const cleaned = s.replace(/\s/g, "");
  if (!cleaned) return false;
  // Match emoji-like characters (simplified: non-ASCII, no letters/digits)
  return /^[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}]+$/u.test(cleaned);
}

function getUnicodeInfo(s: string): { point: string; name: string; year: string } {
  const cleaned = s.replace(/\s/g, "");
  const cp = cleaned.codePointAt(0) ?? 0;
  const hex = cp.toString(16).toUpperCase().padStart(4, "0");
  return {
    point: `U+${hex}`,
    name: cleaned,
    year: "unknown",
  };
}

// ----- Meta intent handlers -----

function resolveMetaSubintent(subintent: string): string[] {
  switch (subintent) {
    case "what-are-you":
    case "who-are-you":
    case "about-self":
    case "capabilities":
      return WHAT_ARE_YOU;
    case "are-you-chatgpt":
      return ARE_YOU_CHATGPT;
    case "are-you-real":
    case "are-you-ai":
    case "are-you-bot":
    case "are-you-human":
    case "self-aware":
    case "consciousness":
      return ARE_YOU_REAL;
    case "what-model":
      return WHAT_MODEL;
    case "are-you-better":
      return BETTER_THAN;
    case "hallucinate":
      return HALLUCINATE;
    case "how-works":
      return HOW_WORK;
    default:
      return WHAT_ARE_YOU;
  }
}

// ----- Social intent detection -----
// General algorithmic detector — not a hardcoded word list.
// Detects: short input + no factual content words + no question structure.

// Social signals: words that are positive indicators of conversational (not factual) intent.
// This list covers the most common cases — the ALGORITHM handles the long tail.
const SOCIAL_SIGNALS = new Set([
  // Greetings
  "hi","hey","hello","howdy","sup","yo","hiya","heya",
  // Reactions/acknowledgments
  "ok","okay","k","lol","lmao","omg","wtf","bruh","bro","dude","yikes","ugh",
  "wow","whoa","woah","hmm","hm","uh","um","ah","oh","err","pfft","yay","oops",
  // Affirmations/negations as standalone
  "yeah","yep","yup","nah","nope","sure","fine","cool","nice","great","sweet",
  "awesome","alright","gotcha","understood","noted","same","damn","dang","geez",
  // Closings
  "bye","cya","goodbye","later","peace","farewell","night","goodnight","later",
  // Thanks/sorry
  "thanks","thx","ty","cheers","sry","np","welcome",
  // Discourse
  "wait","so","then","like","basically","literally","actually",
]);

// Question words that — combined with a noun — signal factual intent (not conversational).
// If these appear AND there's a content word after them, it's NOT conversational.
const QUESTION_WORDS = new Set(["what","who","how","why","when","where","which"]);

// Stop words that are not factual content.
const CONV_STOP = new Set([
  "the","a","an","is","are","was","were","of","in","on","at","to","do","does","did",
  "and","or","but","for","with","by","from","as","that","this","these","those",
  "i","me","we","you","he","she","they","it","my","your","his","her","our","their",
  "have","has","had","will","would","could","should","be","been","not","very","just",
  "can","may","might","shall","up","out","off","down","too","also","so","yet","both",
  "each","any","all","one","its","about","into","than","through",
]);

/**
 * Returns true if the input is conversational (filler, greeting, reaction, acknowledgment)
 * rather than a factual query. Detected algorithmically:
 * - Short input (≤ 5 words)
 * - 0–1 "factual content words" (words that are NOT stopwords, NOT social signals,
 *   NOT question words, AND are long enough to be a real noun/concept)
 * - If 1 content word: it must be very short (≤ 4 chars), ruling out concepts like "gravity"
 */
function isConversationalInput(raw: string): boolean {
  const words = raw.trim().toLowerCase()
    .replace(/[!?.,']+/g, " ").trim()
    .split(/\s+/).filter(Boolean);

  if (words.length === 0) return true;
  if (words.length > 5) return false;

  // Count factual content words: real nouns/concepts that aren't social signals or stop words
  const factualWords = words.filter(w => {
    const clean = w.replace(/[^a-z]/g, "");
    if (clean.length <= 2) return false;                // too short to be factual
    if (CONV_STOP.has(clean)) return false;              // grammatical word
    if (SOCIAL_SIGNALS.has(clean)) return false;         // known social signal
    if (QUESTION_WORDS.has(clean)) return false;         // question word
    return true;                                         // candidate factual word
  });

  // No factual content → definitely conversational
  if (factualWords.length === 0) return true;

  // One short factual word with short overall input → probably conversational
  // "bye", "yes", "wait" etc. These are ≤ 4 chars and not in SOCIAL_SIGNALS
  // Only treat as conversational if single factual word is very short (≤2 chars like "k", "ok")
  // NOT "dna" (3), "mars" (4), "gps" (3) — those are real subjects
  if (factualWords.length === 1 && words.length <= 3 && factualWords[0].replace(/[^a-z]/g, "").length <= 2) {
    return true;
  }

  // Two+ factual words → it's a query, not a reaction
  return false;
}

/**
 * If the input is conversational, return the appropriate response variants.
 * Uses simple pattern detection for routing within social; falls back to NEUTRAL_ACK.
 */
function detectSocialFromRaw(raw: string): string[] | null {
  if (!isConversationalInput(raw)) return null;

  const low = raw.trim().toLowerCase().replace(/[!?.]+$/, "");

  // Route to specific social copy based on signals
  if (/^(hi|hello|hey|howdy|sup|hiya|heya|yo+)\b|^what.?s up/.test(low)) return GREETINGS;
  if (/\b(thank|thanks|thx|ty|appreciate|cheers)\b/.test(low)) return THANKS;
  if (/^(bye|goodbye|goodnight|good night|see ya|later|cya|farewell|peace)\b/.test(low)) return GOODBYES;
  if (/\bhow are you\b|\bare you ok\b|\bare you doing\b|\bhow.?re you\b/.test(low)) return HOW_ARE_YOU;
  if (/\bi love you\b|\bi like you\b|\byou.?re cute\b|\bflirt\b|\bdate me\b/.test(low)) return FLIRTING;
  if (/\broast me\b|\binsult me\b|\bmake fun of me\b/.test(low)) return ROAST_ME;

  // Everything else that passed the conversational filter → neutral acknowledgment
  return NEUTRAL_ACK;
}

// ----- Main pipeline -----

export async function* runPipeline(
  raw: string,
  classified: ClassifyResult,
  context: TurnContext[],
  memory: SessionMemory,
  isRecentQuery: boolean
): AsyncGenerator<SSEEvent> {
  const startMs = Date.now();
  const seed = querySeed(raw);
  const queryHash = String(seed);

  // Detect repeat
  const isRepeat = memory.lastQueryHash === queryHash;
  memory.lastQueryHash = queryHash;
  memory.messageIndex++;

  const provenance: ProvenanceEntry[] = [];
  const blocks: Block[] = [];

  // Helper: emit a status event
  function* status(message: string, source?: string): Generator<SSEEvent> {
    yield {
      event: "status",
      data: { stage: "fetch", message, source },
    };
  }

  // Helper: stream framing + text block
  async function* streamFramingAndText(
    framing: string,
    text: string
  ): AsyncGenerator<SSEEvent> {
    const full = framing ? `${framing}\n\n${text}` : text;
    yield* streamText(full, seed);
  }

  // ------------------------------------------------------------------
  // DEGENERATE INPUT CASES
  // ------------------------------------------------------------------

  const trimmed = raw.trim();

  if (!trimmed) {
    const msg = pickVariant(EMPTY_INPUT, "empty-input", memory, seed);
    yield* streamText(msg, seed);
    yield { event: "done", data: buildEnvelope(classified.intent, blocks, provenance, startMs) };
    return;
  }

  if (trimmed.length > 1500) {
    const wordCount = trimmed.split(/\s+/).length;
    const msg = fillSlots(
      pickVariant(HUGE_PASTE, "huge-paste", memory, seed),
      { wordCount: String(wordCount) }
    );
    yield* streamText(msg, seed);
    yield { event: "done", data: buildEnvelope(classified.intent, blocks, provenance, startMs) };
    return;
  }

  if (isEmojiOnly(trimmed)) {
    const info = getUnicodeInfo(trimmed);
    const framing = fillSlots(
      pickVariant(EMOJI_FRAMING, "emoji-framing", memory, seed),
      { unicodePoint: info.point, unicodeName: info.name, year: info.year }
    );
    yield* streamText(framing, seed);
    yield { event: "done", data: buildEnvelope(classified.intent, blocks, provenance, startMs) };
    return;
  }

  // ------------------------------------------------------------------
  // SOCIAL DETECTION (greetings, thanks, etc.)
  // ------------------------------------------------------------------

  const socialVariants = detectSocialFromRaw(raw);
  if (socialVariants && classified.intent !== "safety") {
    const msg = pickVariant(socialVariants, "social", memory, seed);
    yield* streamText(msg, seed);
    // Add local provenance so buildEnvelope sets verdict="answered" not "declined"
    provenance.push({ source: "local-computation", url: "", label: "social response", fetchedAt: new Date().toISOString() });
    yield { event: "done", data: buildEnvelope(classified.intent, blocks, provenance, startMs) };
    return;
  }

  // ------------------------------------------------------------------
  // SAFETY — highest priority, immediate, no fetch
  // ------------------------------------------------------------------

  if (classified.intent === "safety") {
    const msg = pickVariant(SAFETY_RESPONSES, "safety", memory, seed);
    yield* streamText(msg, seed);
    yield { event: "done", data: buildEnvelope("safety", blocks, provenance, startMs) };
    return;
  }

  // ------------------------------------------------------------------
  // EASTER EGGS — immediate, no fetch (except sam-altman which is Wikipedia)
  // ------------------------------------------------------------------

  if (classified.intent === "easter_egg") {
    const eggId = classified.slots.egg ?? "";

    if (eggId === "sam-altman") {
      yield* status("Looking up Wikipedia...", "wikipedia");
      const wikiResult = await withTimeout(fetchWikiSummary("Sam Altman"));
      if (wikiResult) {
        provenance.push({ ...wikiProvenance(wikiResult), latencyMs: Date.now() - startMs });
        yield* streamFramingAndText(SAM_ALTMAN_FRAMING, wikiResult.extract);
        blocks.push({ type: "wikipedia", content: wikiResult.extract, wasTruncated: false, title: wikiResult.title });
      } else {
        yield* streamText(SAM_ALTMAN_FRAMING, seed);
      }
    } else {
      const eggKey = eggId.replace(/-/g, " ");
      const eggText =
        EASTER_EGGS[eggKey] ??
        EASTER_EGGS[eggId] ??
        pickVariant(WHAT_ARE_YOU, "what-are-you", memory, seed);
      yield* streamText(eggText, seed);
      // Local provenance so buildEnvelope sets verdict="answered" not "declined"
      provenance.push({
        source: "local-computation",
        url: "",
        label: `Easter egg: ${eggKey || eggId}`,
        fetchedAt: new Date().toISOString(),
      });
    }

    yield {
      event: "provenance",
      data: { sources: provenance },
    };
    yield { event: "done", data: buildEnvelope("easter_egg", blocks, provenance, startMs) };
    return;
  }

  // ------------------------------------------------------------------
  // JAILBREAK
  // ------------------------------------------------------------------

  if (classified.intent === "jailbreak") {
    const msg = pickVariant(JAILBREAK_RESPONSES, "jailbreak", memory, seed);
    yield* streamText(msg, seed);
    yield { event: "done", data: buildEnvelope("jailbreak", blocks, provenance, startMs) };
    return;
  }

  // ------------------------------------------------------------------
  // ROLEPLAY
  // ------------------------------------------------------------------

  if (classified.intent === "roleplay") {
    const msg = pickVariant(ROLEPLAY_RESPONSES, "roleplay", memory, seed);
    yield* streamText(msg, seed);
    yield { event: "done", data: buildEnvelope("roleplay", blocks, provenance, startMs) };
    return;
  }

  // ------------------------------------------------------------------
  // META / SELF-REFERENTIAL
  // ------------------------------------------------------------------

  if (classified.intent === "meta_self") {
    const subintent = classified.slots.subintent ?? "what-are-you";
    const variants = resolveMetaSubintent(subintent);
    const msg = pickVariant(variants, `meta-${subintent}`, memory, seed);
    yield* streamText(msg, seed);
    yield { event: "done", data: buildEnvelope("meta_self", blocks, provenance, startMs) };
    return;
  }

  // ------------------------------------------------------------------
  // MATH
  // ------------------------------------------------------------------

  if (classified.intent === "math") {
    yield* status("Computing...");
    const expr = classified.slots.expression ?? classified.residual;
    const result = safeEval(expr, classified);
    if (result !== null) {
      const formatted = applyModifiers(result, classified);
      blocks.push({ type: "math", expression: expr, result: formatted });
      const mathProv: ProvenanceEntry = {
        source: "local-computation",
        url: "",
        label: `Computed: ${expr}`,
        fetchedAt: new Date().toISOString(),
      };
      provenance.push(mathProv);
      yield* streamText(`**${formatted}**`, seed);
      yield { event: "block", data: blocks[blocks.length - 1] };
    } else {
      const msg = pickVariant(UNPARSEABLE, "unparseable", memory, seed);
      memory.failureStreak++;
      yield* streamText(msg, seed);
    }
    yield { event: "done", data: buildEnvelope("math", blocks, provenance, startMs) };
    return;
  }

  // ------------------------------------------------------------------
  // TIME
  // ------------------------------------------------------------------

  if (classified.intent === "time") {
    yield* status("Checking time...");
    const location = classified.slots.location;
    if (location) {
      // Geocode + timezone via open-meteo geocoding
      yield* status("Geocoding...", "open-meteo");
      const geoResult = await withTimeout(geocodeLocation(location));
      if (geoResult) {
        const timeResult = getTimeForZone(geoResult.timezone);
        blocks.push({ type: "time", iso: timeResult.iso, timezone: geoResult.timezone, display: timeResult.display });
        const timeProv: ProvenanceEntry = {
          source: "open-meteo-geocoding",
          url: `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}`,
          label: `Time in ${geoResult.name}`,
          fetchedAt: new Date().toISOString(),
          latencyMs: Date.now() - startMs,
        };
        provenance.push(timeProv);
        yield* streamText(`**${timeResult.display}** in ${geoResult.name} (${geoResult.timezone})`, seed);
        yield { event: "block", data: blocks[blocks.length - 1] };
      } else {
        const msg = fillSlots(
          pickVariant(SOURCE_DOWN, "source-down", memory, seed),
          { source: "geocoding service" }
        );
        yield* streamText(msg, seed);
      }
    } else {
      // UTC
      const now = new Date();
      const iso = now.toISOString();
      const display = now.toUTCString();
      blocks.push({ type: "time", iso, timezone: "UTC", display });
      provenance.push({
        source: "local-computation",
        url: "",
        label: "Current UTC time",
        fetchedAt: iso,
      });
      yield* streamText(`**${display}** (UTC)`, seed);
      yield { event: "block", data: blocks[blocks.length - 1] };
    }
    yield { event: "provenance", data: { sources: provenance } };
    yield { event: "done", data: buildEnvelope("time", blocks, provenance, startMs) };
    return;
  }

  // ------------------------------------------------------------------
  // WEATHER
  // ------------------------------------------------------------------

  if (classified.intent === "weather") {
    const location = classified.slots.location ?? "New York";
    yield* status("Geocoding...", "open-meteo");

    const geoResult = await withTimeout(geocodeLocation(location));
    if (!geoResult) {
      const msg = fillSlots(
        pickVariant(SOURCE_DOWN, "source-down", memory, seed),
        { source: "geocoding service" }
      );
      memory.failureStreak++;
      yield* streamText(msg, seed);
      yield { event: "done", data: buildEnvelope("weather", blocks, provenance, startMs) };
      return;
    }

    yield* status("Fetching forecast...", "open-meteo");
    const forecast = await withTimeout(fetchWeather(geoResult.lat, geoResult.lon, geoResult.timezone));

    if (!forecast) {
      const msg = fillSlots(
        pickVariant(SOURCE_DOWN, "source-down", memory, seed),
        { source: "Open-Meteo weather API" }
      );
      memory.failureStreak++;
      yield* streamText(msg, seed);
      yield { event: "done", data: buildEnvelope("weather", blocks, provenance, startMs) };
      return;
    }

    provenance.push({
      source: "open-meteo",
      url: `https://api.open-meteo.com/v1/forecast?latitude=${geoResult.lat}&longitude=${geoResult.lon}`,
      label: `Weather for ${geoResult.name}`,
      fetchedAt: new Date().toISOString(),
      latencyMs: Date.now() - startMs,
    });

    memory.failureStreak = 0;
    const block: Block = { type: "weather-card", ...forecast, location: geoResult.name };
    blocks.push(block);

    const summary = `**${forecast.temperatureF}°F** (${Math.round((forecast.temperatureF - 32) * 5 / 9)}°C), ${forecast.description} in ${geoResult.name}.`;
    yield* streamText(summary, seed);
    yield { event: "block", data: block };
    yield { event: "provenance", data: { sources: provenance } };
    yield { event: "done", data: buildEnvelope("weather", blocks, provenance, startMs) };
    return;
  }

  // ------------------------------------------------------------------
  // UNIT CONVERSION
  // ------------------------------------------------------------------

  if (classified.intent === "convert_units") {
    const value = parseFloat(classified.slots.value ?? "1") || 1;
    const fromUnit = classified.slots.fromUnit ?? classified.slots.fromRaw ?? "";
    const toUnit = classified.slots.toUnit ?? classified.slots.toRaw ?? "";

    try {
      // Use mathjs for unit conversion
      const mathjs = await import("mathjs");
      const result = mathjs.evaluate(`${value} ${fromUnit} to ${toUnit}`);
      const resultStr = result.toString().replace(/\s+/g, " ");

      const block: Block = {
        type: "unit",
        value,
        fromUnit,
        toUnit,
        result: typeof result === "object" && "toNumber" in result ? (result as {toNumber: () => number}).toNumber() : parseFloat(resultStr),
      };
      blocks.push(block);

      provenance.push({
        source: "local-computation",
        url: "",
        label: `${value} ${fromUnit} to ${toUnit}`,
        fetchedAt: new Date().toISOString(),
      });

      yield* streamText(`**${value} ${fromUnit}** = **${resultStr}**`, seed);
      yield { event: "block", data: block };
      yield { event: "provenance", data: { sources: provenance } };
    } catch {
      const msg = fillSlots(
        pickVariant(UNPARSEABLE, "unparseable", memory, seed),
        {}
      );
      yield* streamText(msg, seed);
    }
    yield { event: "done", data: buildEnvelope("convert_units", blocks, provenance, startMs) };
    return;
  }

  // ------------------------------------------------------------------
  // CURRENCY CONVERSION
  // ------------------------------------------------------------------

  if (classified.intent === "convert_currency") {
    const fromCode = (classified.slots.from ?? "USD").toUpperCase();
    const toCode = (classified.slots.to ?? "EUR").toUpperCase();
    const amount = parseFloat(classified.slots.amount ?? "1") || 1;
    const isCrypto = classified.slots.isCrypto === "true";

    yield* status(`Fetching ${fromCode}/${toCode} rate...`, isCrypto ? "coingecko" : "frankfurter");

    const rateResult = await withTimeout(
      isCrypto ? fetchCryptoRate(fromCode, toCode) : fetchFiatRate(fromCode, toCode)
    );

    if (!rateResult) {
      const msg = fillSlots(
        pickVariant(SOURCE_DOWN, "source-down", memory, seed),
        { source: isCrypto ? "CoinGecko" : "Frankfurter" }
      );
      memory.failureStreak++;
      yield* streamText(msg, seed);
      yield { event: "done", data: buildEnvelope("convert_currency", blocks, provenance, startMs) };
      return;
    }

    memory.failureStreak = 0;
    const result = amount * rateResult.rate;
    const block: Block = {
      type: "currency",
      from: fromCode,
      to: toCode,
      amount,
      result,
      rate: rateResult.rate,
      date: rateResult.date,
    };
    blocks.push(block);
    provenance.push({
      source: isCrypto ? "coingecko" : "frankfurter",
      url: isCrypto
        ? `https://api.coingecko.com/api/v3/simple/price`
        : `https://api.frankfurter.app/latest?from=${fromCode}&to=${toCode}`,
      label: `${fromCode}/${toCode} exchange rate`,
      fetchedAt: new Date().toISOString(),
      latencyMs: Date.now() - startMs,
    });

    yield* streamText(
      `**${amount} ${fromCode}** = **${result.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${toCode}** (rate: ${rateResult.rate}, as of ${rateResult.date})`,
      seed
    );
    yield { event: "block", data: block };
    yield { event: "provenance", data: { sources: provenance } };
    yield { event: "done", data: buildEnvelope("convert_currency", blocks, provenance, startMs) };
    return;
  }

  // ------------------------------------------------------------------
  // DEFINITION
  // ------------------------------------------------------------------

  if (classified.intent === "definition") {
    const term = classified.slots.term ?? classified.residual;
    yield* status(`Looking up "${term}"...`, "wiktionary");

    const defResult = await withTimeout(fetchDefinition(term));

    if (!defResult) {
      // Try keyboard mash detection
      if (looksLikeKeyboardMash(term)) {
        const msg = fillSlots(
          pickVariant(KEYBOARD_MASH, "keyboard-mash", memory, seed),
          { term, sourceCount: "3", ms: String(Date.now() - startMs) }
        );
        yield* streamText(msg, seed);
      } else {
        memory.failureStreak++;
        if (memory.failureStreak >= 3) {
          const rider = pickVariant(FAILURE_STREAK_RIDER, "failure-streak", memory, seed);
          const notFound = pickVariant(NOT_FOUND, "not-found", memory, seed);
          yield* streamText(`${notFound}\n\n${rider}`, seed);
        } else {
          const msg = fillSlots(
            pickVariant(NOT_FOUND, "not-found", memory, seed),
            { sourceCount: "2", ms: String(Date.now() - startMs), term }
          );
          yield* streamText(msg, seed);
        }
      }
      yield { event: "done", data: buildEnvelope("definition", blocks, provenance, startMs) };
      return;
    }

    memory.failureStreak = 0;
    provenance.push({
      ...dictionaryProvenance(defResult.source, term),
      latencyMs: Date.now() - startMs,
    });

    const entry = defResult.entry;
    const topMeaning = entry.meanings[0];
    const topDef = topMeaning?.definitions[0];

    const block: Block = {
      type: "definition",
      word: entry.word,
      phonetic: entry.phonetic,
      meanings: entry.meanings,
    };
    blocks.push(block);

    const leadIn = pickVariant(DICT_LEAD_INS, "dict-lead-in", memory, seed);
    const phonetic = entry.phonetic ? ` /${entry.phonetic}/` : "";
    const defText = topDef
      ? `**${entry.word}**${phonetic} *(${topMeaning.partOfSpeech})*\n\n${topDef.definition}${topDef.example ? `\n\n*"${topDef.example}"*` : ""}`
      : `**${entry.word}**: definition found, see source.`;

    yield* streamFramingAndText(leadIn, defText);
    yield { event: "block", data: block };
    yield { event: "provenance", data: { sources: provenance } };
    yield { event: "done", data: buildEnvelope("definition", blocks, provenance, startMs) };
    return;
  }

  // ------------------------------------------------------------------
  // OPINION
  // ------------------------------------------------------------------

  if (classified.intent === "opinion") {
    const slots = classified.slots;
    const isAdvice = /should i|advice|recommend/i.test(raw);
    const isPrediction = classified.slots.subtype === "prediction" || /will|predict|future|going to|what would happen/i.test(raw);

    let variants: string[];
    let categoryId: string;
    if (isAdvice) {
      variants = UNANSWERABLE_ADVICE;
      categoryId = "unanswerable-advice";
    } else if (isPrediction) {
      variants = UNANSWERABLE_PREDICTION;
      categoryId = "unanswerable-prediction";
    } else {
      variants = UNANSWERABLE_OPINION;
      categoryId = "unanswerable-opinion";
    }

    const msg = pickVariant(variants, categoryId, memory, seed);

    // Factual pivot only for opinion queries (not predictions/hypotheticals/advice —
    // those are cleaner as a flat decline; pivoting to a bad article is worse than nothing)
    const pivot = !isPrediction && !isAdvice ? (classified.slots.topic ?? classified.residual) : null;
    if (pivot && pivot.length > 2 && pivot.length < 60) {
      yield* streamText(msg, seed);
      yield* status("Finding factual background...", "wikipedia");
      const wikiResult = await withTimeout(searchAndFetch(pivot));
      if (wikiResult && wikiResult.type !== "disambiguation") {
        const { truncated, wasTruncated } = truncateExtract(wikiResult.extract);
        provenance.push({ ...wikiProvenance(wikiResult), latencyMs: Date.now() - startMs });
        blocks.push({ type: "wikipedia", content: truncated, wasTruncated, title: wikiResult.title });
        yield* streamText(`\n\nFor context, here's what Wikipedia says about **${wikiResult.title}**:\n\n${truncated}`, seed);
        // REMOVED: wikipedia text already in delta stream, no block event needed;
      }
    } else {
      yield* streamText(msg, seed);
    }

    yield { event: "provenance", data: { sources: provenance } };
    yield { event: "done", data: buildEnvelope("opinion", blocks, provenance, startMs) };
    return;
  }

  // ------------------------------------------------------------------
  // CREATIVE REQUEST
  // ------------------------------------------------------------------

  if (classified.intent === "creative_request") {
    const form = classified.slots.form ?? "";

    if (form === "joke" || /\bjoke\b/.test(raw.toLowerCase())) {
      // Pick a real true-but-funny fact
      const factIdx = seed % TRUE_FACTS.length;
      const fact = TRUE_FACTS[factIdx];
      const leadIn = pickVariant(JOKE_REQUEST, "joke-request", memory, seed);
      yield* streamText(`${leadIn}\n\n${fact.text}`, seed);
      provenance.push({
        source: fact.attribution.toLowerCase(),
        url: fact.source,
        label: fact.attribution,
        fetchedAt: new Date().toISOString(),
      });
      yield { event: "provenance", data: { sources: provenance } };
      yield { event: "done", data: buildEnvelope("creative_request", blocks, provenance, startMs) };
      return;
    }

    if (form === "poem" || form === "haiku" || form === "sonnet" || form === "limerick" || form === "verse" || form === "ode") {
      const leadIn = pickVariant(POEM_REQUEST, "poem-request", memory, seed);
      yield* status("Fetching poem...", "poetrydb");
      const poem = await withTimeout(fetchPoem());
      if (poem) {
        provenance.push({
          source: "poetrydb",
          url: `https://poetrydb.org/author/${encodeURIComponent(poem.author)}`,
          label: `${poem.title} by ${poem.author}`,
          fetchedAt: new Date().toISOString(),
          latencyMs: Date.now() - startMs,
        });
        const block: Block = {
          type: "poem",
          title: poem.title,
          author: poem.author,
          lines: poem.lines,
        };
        blocks.push(block);
        const poemText = `*${poem.title}*\nby ${poem.author}\n\n${poem.lines.join("\n")}`;
        yield* streamFramingAndText(leadIn, poemText);
        yield { event: "block", data: block };
      } else {
        yield* streamText(pickVariant(POEM_REQUEST, "poem-request", memory, seed), seed);
      }
      yield { event: "provenance", data: { sources: provenance } };
      yield { event: "done", data: buildEnvelope("creative_request", blocks, provenance, startMs) };
      return;
    }

    if (form === "story" || form === "fiction" || form === "tale" || form === "narrative") {
      const msg = pickVariant(STORY_REQUEST, "story-request", memory, seed);
      yield* streamText(msg, seed);
      yield { event: "done", data: buildEnvelope("creative_request", blocks, provenance, startMs) };
      return;
    }

    // Homework / essay detection
    if (/\b(essay|homework|assignment|paper)\b/i.test(raw)) {
      const msg = pickVariant(HOMEWORK, "homework", memory, seed);
      yield* streamText(msg, seed);
      yield { event: "done", data: buildEnvelope("creative_request", blocks, provenance, startMs) };
      return;
    }

    // Default creative refusal
    const msg = pickVariant(STORY_REQUEST, "creative-refusal", memory, seed);
    yield* streamText(msg, seed);
    yield { event: "done", data: buildEnvelope("creative_request", blocks, provenance, startMs) };
    return;
  }

  // ------------------------------------------------------------------
  // CODE REQUEST
  // ------------------------------------------------------------------

  if (classified.intent === "code_request") {
    const lang = classified.slots.language ?? "";
    const topic = classified.slots.topic ?? classified.residual;
    const leadIn = pickVariant(CODE_REQUEST, "code-request", memory, seed);
    yield* status("Searching Stack Overflow...", "stackoverflow");

    const soQuery = lang ? `${topic} ${lang}` : topic;
    const soResults = await withTimeout(fetchStackOverflow(soQuery));

    if (!soResults || soResults.length === 0) {
      const msg = fillSlots(
        pickVariant(SOURCE_DOWN, "source-down", memory, seed),
        { source: "Stack Overflow" }
      );
      memory.failureStreak++;
      yield* streamText(msg, seed);
    } else {
      memory.failureStreak = 0;
      provenance.push({
        source: "stackoverflow",
        url: `https://api.stackexchange.com/2.3/search/advanced?q=${encodeURIComponent(soQuery)}&site=stackoverflow`,
        label: "Stack Overflow search",
        fetchedAt: new Date().toISOString(),
        latencyMs: Date.now() - startMs,
      });
      const block: Block = {
        type: "so-results",
        question: soQuery,
        hits: soResults,
      };
      blocks.push(block);
      yield* streamText(leadIn, seed);
      yield { event: "block", data: block };
    }

    yield { event: "provenance", data: { sources: provenance } };
    yield { event: "done", data: buildEnvelope("code_request", blocks, provenance, startMs) };
    return;
  }

  // ------------------------------------------------------------------
  // COMPARISON
  // ------------------------------------------------------------------

  if (classified.intent === "comparison") {
    const entityA = classified.slots.entityA ?? "";
    const entityB = classified.slots.entityB ?? "";

    if (!entityA || !entityB) {
      const msg = pickVariant(UNPARSEABLE, "unparseable", memory, seed);
      memory.failureStreak++;
      yield* streamText(msg, seed);
      yield { event: "done", data: buildEnvelope("comparison", blocks, provenance, startMs) };
      return;
    }

    yield* status(`Looking up ${entityA}...`, "wikipedia");
    yield* status(`Looking up ${entityB}...`, "wikipedia");

    // Helper: resolve an entity to a usable extract.
    // If Wikipedia returns a disambiguation page, try: (1) dictionary, (2) first dab link article.
    const resolveEntity = async (entity: string): Promise<{ extract: string; title: string; source: "wikipedia" | "dictionary"; wikibaseItem?: string } | null> => {
      const wiki = await withTimeout(searchAndFetch(entity));
      if (!wiki) return null;

      // Good Wikipedia article — use it
      if (wiki.type !== "disambiguation" && wiki.extract) {
        return { extract: wiki.extract, title: wiki.title, source: "wikipedia", wikibaseItem: wiki.wikibaseItem };
      }

      // Disambiguation page — try dictionary first (entity may be a common word)
      const dictResult = await withTimeout(fetchDefinition(entity));
      if (dictResult) {
        const top = dictResult.entry.meanings[0]?.definitions[0];
        if (top) {
          const partOfSpeech = dictResult.entry.meanings[0].partOfSpeech;
          const extract = `*(${partOfSpeech})* ${top.definition}${top.example ? ` — *"${top.example}"*` : ""}`;
          return { extract, title: entity, source: "dictionary" };
        }
      }

      // Try first non-dab article linked from the disambiguation page
      const { fetchDabOptions } = await import("./sources/wikipedia");
      const dabLinks = await withTimeout(fetchDabOptions(wiki.title)) ?? [];
      if (dabLinks.length > 0) {
        const firstArticle = await withTimeout(fetchWikiSummary(dabLinks[0].title));
        if (firstArticle?.extract && firstArticle.type !== "disambiguation") {
          return { extract: firstArticle.extract, title: firstArticle.title, source: "wikipedia", wikibaseItem: firstArticle.wikibaseItem };
        }
      }

      // Last resort: use the dab extract but clean it up (strip "may refer to:" prefix)
      if (wiki.extract) {
        const cleaned = wiki.extract.replace(/^[^:]+:\s*/i, "").replace(/\n/g, " · ").trim();
        return { extract: cleaned, title: wiki.title, source: "wikipedia", wikibaseItem: wiki.wikibaseItem };
      }
      return null;
    };

    const [resA, resB] = await Promise.all([resolveEntity(entityA), resolveEntity(entityB)]);

    if (!resA || !resB) {
      const notFound = fillSlots(
        pickVariant(NOT_FOUND, "not-found", memory, seed),
        { sourceCount: "2", ms: String(Date.now() - startMs), term: !resA ? entityA : entityB }
      );
      memory.failureStreak++;
      yield* streamText(notFound, seed);
      yield { event: "done", data: buildEnvelope("comparison", blocks, provenance, startMs) };
      return;
    }

    memory.failureStreak = 0;
    if (resA.source === "wikipedia") {
      const wikiSumA = await withTimeout(fetchWikiSummary(resA.title));
      if (wikiSumA) provenance.push({ ...wikiProvenance(wikiSumA), latencyMs: Date.now() - startMs });
    } else {
      provenance.push({ source: "dictionaryapi", url: `https://api.dictionaryapi.dev/api/v2/entries/en/${entityA}`, label: entityA, fetchedAt: new Date().toISOString() });
    }
    if (resB.source === "wikipedia") {
      const wikiSumB = await withTimeout(fetchWikiSummary(resB.title));
      if (wikiSumB) provenance.push({ ...wikiProvenance(wikiSumB), latencyMs: Date.now() - startMs });
    } else {
      provenance.push({ source: "dictionaryapi", url: `https://api.dictionaryapi.dev/api/v2/entries/en/${entityB}`, label: entityB, fetchedAt: new Date().toISOString() });
    }

    // Fetch shared Wikidata properties if both resolved from Wikipedia with QIDs
    const rows: Array<{ property: string; values: string[] }> = [];
    if (resA.wikibaseItem && resB.wikibaseItem) {
      yield* status("Fetching shared properties...", "wikidata");
      const COMPARISON_PROPS = ["P569", "P570", "P1082", "P571", "P577", "P36", "P159", "P169", "P2218"];
      const sharedProps = await withTimeout(
        fetchSharedProperties(resA.wikibaseItem, resB.wikibaseItem, COMPARISON_PROPS)
      );
      if (sharedProps && sharedProps.length > 0) {
        const propLabels: Record<string, string> = {
          P569: "Date of birth", P570: "Date of death", P1082: "Population",
          P571: "Inception", P577: "Publication date", P36: "Capital",
          P159: "Headquarters", P169: "CEO", P2218: "Net worth",
        };
        for (const { pid, valueA, valueB } of sharedProps) {
          const [fmtA, fmtB] = await Promise.all([formatValue(valueA), formatValue(valueB)]);
          rows.push({ property: propLabels[pid] ?? pid, values: [fmtA, fmtB] });
        }
        provenance.push({
          source: "wikidata",
          url: `https://www.wikidata.org/wiki/${resA.wikibaseItem}`,
          label: "Wikidata comparison",
          fetchedAt: new Date().toISOString(),
        });
      }
    }

    // Render: table if we have Wikidata rows, otherwise side-by-side extracts
    if (rows.length > 0) {
      const block: Block = {
        type: "comparison-table",
        entities: [resA.title, resB.title],
        rows,
      };
      blocks.push(block);
      yield* streamText(`Comparing **${resA.title}** and **${resB.title}**:`, seed);
      yield { event: "block", data: block };
    } else {
      const { truncated: extractA } = truncateExtract(resA.extract);
      const { truncated: extractB } = truncateExtract(resB.extract);
      const compText = `**${resA.title}**\n${extractA}\n\n**${resB.title}**\n${extractB}`;
      yield* streamText(compText, seed);
    }

    yield { event: "provenance", data: { sources: provenance } };
    yield { event: "done", data: buildEnvelope("comparison", blocks, provenance, startMs) };
    return;
  }

  // ------------------------------------------------------------------
  // NEWS RECENT
  // ------------------------------------------------------------------

  if (classified.intent === "news_recent") {
    const topic = classified.slots.topic ?? classified.residual;
    yield* status("Checking Wikimedia recent changes...", "wikipedia");

    // Fetch Wikipedia's "in the news" feed
    const wikiNewsResult = await withTimeout(fetchWikiNews(topic));

    if (!wikiNewsResult || wikiNewsResult.length === 0) {
      // Try HN for tech topics
      const isTech = /\b(tech|software|ai|startup|coding|developer|programming|app)\b/i.test(raw);
      if (isTech) {
        yield* status("Checking Hacker News...", "hackernews");
        const hnResults = await withTimeout(fetchHackerNews(topic));
        if (hnResults && hnResults.length > 0) {
          memory.failureStreak = 0;
          provenance.push({
            source: "hackernews",
            url: `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(topic)}&tags=story`,
            label: "Hacker News",
            fetchedAt: new Date().toISOString(),
            latencyMs: Date.now() - startMs,
          });
          const block: Block = { type: "hn", results: hnResults };
          blocks.push(block);
          yield* streamText(`Recent from Hacker News on **${topic}**:`, seed);
          yield { event: "block", data: block };
          yield { event: "provenance", data: { sources: provenance } };
          yield { event: "done", data: buildEnvelope("news_recent", blocks, provenance, startMs) };
          return;
        }
      }

      memory.failureStreak++;
      const msg = fillSlots(
        pickVariant(NOT_FOUND, "not-found", memory, seed),
        { sourceCount: "2", ms: String(Date.now() - startMs), term: topic }
      );
      yield* streamText(msg, seed);
      yield { event: "done", data: buildEnvelope("news_recent", blocks, provenance, startMs) };
      return;
    }

    memory.failureStreak = 0;
    provenance.push({
      source: "wikipedia",
      url: `https://en.wikipedia.org/wiki/Portal:Current_events`,
      label: "Wikipedia Current Events",
      fetchedAt: new Date().toISOString(),
      latencyMs: Date.now() - startMs,
    });

    const summaryText = wikiNewsResult.slice(0, 3).map((r) => `- **${r.title}**: ${r.extract.slice(0, 120)}...`).join("\n");
    yield* streamText(`Recent information from Wikipedia on **${topic}**:\n\n${summaryText}`, seed);

    for (const r of wikiNewsResult.slice(0, 3)) {
      blocks.push({ type: "wikipedia", content: r.extract, wasTruncated: true, title: r.title });
    }

    yield { event: "provenance", data: { sources: provenance } };
    yield { event: "done", data: buildEnvelope("news_recent", blocks, provenance, startMs) };
    return;
  }

  // ------------------------------------------------------------------
  // STRUCTURED FACT (height, age, population, capital, etc.)
  // ------------------------------------------------------------------

  if (classified.intent === "structured_fact") {
    const entity = classified.slots.entity ?? classified.residual;
    const label = classified.slots.property ?? classified.slots.label ?? "fact";
    const properties = (classified.slots.wikidata_properties ?? classified.slots.properties ?? "").split(",").filter(Boolean);

    // "first" label: historical firsts — search Wikipedia with full raw query
    // "who was the first person in space" → avoids "first-person shooter" via full query search
    if (label === "first") {
      yield* status(`Looking up ${entity}...`, "wikipedia");
      const firstSearch = await withTimeout(searchWiki(raw, 5));
      const bestHit = firstSearch?.hits?.find(h =>
        !h.title.toLowerCase().includes("first-person") &&
        !h.title.toLowerCase().includes("shooter") &&
        !h.title.toLowerCase().includes("game")
      ) ?? firstSearch?.hits?.[0];
      const firstArticle = bestHit ? await withTimeout(fetchWikiSummary(bestHit.title)) : null;
      if (firstArticle?.extract && firstArticle.type !== "disambiguation") {
        const { truncated } = truncateExtract(firstArticle.extract);
        provenance.push({ ...wikiProvenance(firstArticle), latencyMs: Date.now() - startMs });
        blocks.push({ type: "wikipedia", content: truncated, wasTruncated: false, title: firstArticle.title });
        memory.failureStreak = 0;
        yield* streamText(truncated, seed);
        // REMOVED: wikipedia text already in delta stream, no block event needed;
      } else {
        memory.failureStreak++;
        yield* streamText(pickVariant(NOT_FOUND, "not-found", memory, seed), seed);
      }
      yield { event: "provenance", data: { sources: provenance } };
      yield { event: "done", data: buildEnvelope("structured_fact", blocks, provenance, startMs) };
      return;
    }

    // "count" label: how many X does Y have — search Wikipedia directly (no Wikidata property)
    if (label === "count") {
      yield* status(`Looking up ${entity}...`, "wikipedia");
      // Search with the full original query — Wikipedia search handles natural language well
      const countSearch = await withTimeout(searchWiki(raw, 3));
      const bestHit = countSearch?.hits?.[0];
      const countArticle = bestHit ? await withTimeout(fetchWikiSummary(bestHit.title)) : null;
      if (countArticle?.extract && countArticle.type !== "disambiguation") {
        const { truncated } = truncateExtract(countArticle.extract);
        provenance.push({ ...wikiProvenance(countArticle), latencyMs: Date.now() - startMs });
        blocks.push({ type: "wikipedia", content: truncated, wasTruncated: false, title: countArticle.title });
        memory.failureStreak = 0;
        yield* streamText(truncated, seed);
        // REMOVED: wikipedia text already in delta stream, no block event needed;
      } else {
        memory.failureStreak++;
        yield* streamText(pickVariant(NOT_FOUND, "not-found", memory, seed), seed);
      }
      yield { event: "provenance", data: { sources: provenance } };
      yield { event: "done", data: buildEnvelope("structured_fact", blocks, provenance, startMs) };
      return;
    }

    // "distance"/"speed"/"length" label: Wikidata property lookup, fallback to Wikipedia search
    if (label === "distance" || label === "speed" || label === "length") {
      yield* status(`Looking up ${entity}...`, "wikipedia");
      const wikiRes = await withTimeout(searchAndFetch(entity));
      if (wikiRes?.wikibaseItem && properties.length) {
        const factValue = await withTimeout(fetchFirstProperty(wikiRes.wikibaseItem, properties));
        if (factValue) {
          const formatted = await formatValue(factValue);
          provenance.push({ ...wikiProvenance(wikiRes), latencyMs: Date.now() - startMs });
          provenance.push({ ...wikidataProvenance(wikiRes.wikibaseItem), latencyMs: Date.now() - startMs });
          memory.failureStreak = 0;
          yield* streamText(`**${wikiRes.title}** — ${label}: **${formatted}**`, seed);
          yield { event: "provenance", data: { sources: provenance } };
          yield { event: "done", data: buildEnvelope("structured_fact", blocks, provenance, startMs) };
          return;
        }
      }
      // Fallback: search Wikipedia with full raw query
      const distSearch = await withTimeout(searchWiki(raw, 3));
      const bestHit = distSearch?.hits?.[0];
      const distArticle = bestHit ? await withTimeout(fetchWikiSummary(bestHit.title)) : null;
      if (distArticle?.extract && distArticle.type !== "disambiguation") {
        const { truncated } = truncateExtract(distArticle.extract);
        provenance.push({ ...wikiProvenance(distArticle), latencyMs: Date.now() - startMs });
        blocks.push({ type: "wikipedia", content: truncated, wasTruncated: false, title: distArticle.title });
        memory.failureStreak = 0;
        yield* streamText(truncated, seed);
        // REMOVED: wikipedia text already in delta stream, no block event needed;
      } else {
        memory.failureStreak++;
        yield* streamText(pickVariant(NOT_FOUND, "not-found", memory, seed), seed);
      }
      yield { event: "provenance", data: { sources: provenance } };
      yield { event: "done", data: buildEnvelope("structured_fact", blocks, provenance, startMs) };
      return;
    }

    // "corporate leader" label: who runs/leads/heads/is CEO of a company
    // Uses Wikidata P169 (CEO), P112 (founder) on the company entity.
    if (label === "corporate leader" || (label === "founded by" && properties.includes("P112"))) {
      yield* status(`Looking up ${entity}...`, "wikipedia");
      // Try the entity search, but if it resolves to a PERSON article, also try "[entity] company"
      const orgArticle = await withTimeout(searchAndFetch(entity));
      // Detect if we got a person article instead of a company (by description)
      const gotPerson = orgArticle?.description?.match(/\b(inventor|scientist|physicist|engineer|mathematician|philosopher|artist|musician|actor|writer|politician)\b/i);
      const companyArticle = gotPerson
        ? await withTimeout(searchAndFetch(`${entity} company`))
        : orgArticle;

      let leaderArticle = null;
      if (companyArticle?.wikibaseItem) {
        // Try CEO first, then founder
        const leaderProps = label === "founded by" ? ["P112", "P169"] : ["P169", "P112", "P488"];
        const leaderValue = await withTimeout(fetchFirstProperty(companyArticle.wikibaseItem, leaderProps));
        if (leaderValue?.type === "entity") {
          const personLabel = await withTimeout(fetchLabel(leaderValue.id));
          if (personLabel) {
            leaderArticle = await withTimeout(fetchWikiSummary(personLabel));
          }
        }
      }
      // Fallback: search "[entity] CEO/founder" and pick a PERSON article, not the company
      if (!leaderArticle?.extract) {
        const fallbackTerm = label === "founded by" ? `${entity} founder` : `${entity} CEO`;
        const fallbackSearch = await withTimeout(searchWiki(fallbackTerm, 5));
        // Skip company articles (those that contain the entity name + Inc/Corp/Ltd or are just the company)
        const entityLower = entity.toLowerCase();
        const bestHit = fallbackSearch?.hits?.find(h => {
          const titleLower = h.title.toLowerCase();
          // Skip if it's just the company article
          if (titleLower === entityLower || titleLower === `${entityLower}, inc.` ||
              /\b(inc\.|corp\.|ltd\.|llc|company|corporation|group)\b/i.test(h.title)) return false;
          // Prefer person articles or CEO/founder articles
          return /CEO|chief|executive|founder|president|director|creator|owner/i.test(h.title) ||
            (/\b(born|businessman|businesswoman|entrepreneur|executive)\b/i.test(h.snippet || "")) ||
            // Take any hit that isn't obviously the company
            (!titleLower.startsWith(entityLower.split(/\s+/)[0]));
        }) ?? fallbackSearch?.hits?.[1]; // skip first if it's likely company
        if (bestHit) leaderArticle = await withTimeout(fetchWikiSummary(bestHit.title));
      }
      if (leaderArticle?.extract && leaderArticle.type !== "disambiguation") {
        const { truncated } = truncateExtract(leaderArticle.extract);
        provenance.push({ ...wikiProvenance(leaderArticle), latencyMs: Date.now() - startMs });
        blocks.push({ type: "wikipedia", content: truncated, wasTruncated: false, title: leaderArticle.title });
        memory.failureStreak = 0;
        yield* streamText(truncated, seed);
        yield { event: "provenance", data: { sources: provenance } };
        yield { event: "done", data: buildEnvelope("structured_fact", blocks, provenance, startMs) };
        return;
      }
      memory.failureStreak++;
      yield* streamText(pickVariant(NOT_FOUND, "not-found", memory, seed), seed);
      yield { event: "provenance", data: { sources: provenance } };
      yield { event: "done", data: buildEnvelope("structured_fact", blocks, provenance, startMs) };
      return;
    }

    // "current holder" label: find via Wikidata P1308 (officeholder), P35 (head of state),
    // P6 (head of government) on the role entity — avoids guessing the person's name
    if (label === "current holder") {
      yield* status(`Looking up current ${entity}...`, "wikipedia");
      // Find the role's QID via Wikipedia
      const roleArticle = await withTimeout(searchAndFetch(entity));
      let holderArticle = null;
      if (roleArticle?.wikibaseItem) {
        // Try officeholder properties in order
        const holderProps = ["P1308", "P35", "P6", "P169"];
        const holderValue = await withTimeout(fetchFirstProperty(roleArticle.wikibaseItem, holderProps));
        if (holderValue?.type === "entity") {
          // Fetch the label (person's name) then their Wikipedia article
          const personLabel = await withTimeout(fetchLabel(holderValue.id));
          if (personLabel) {
            holderArticle = await withTimeout(fetchWikiSummary(personLabel));
          }
          // Also try by Wikidata entity page
          if (!holderArticle?.extract) {
            const personSearch = await withTimeout(searchWiki(holderValue.id, 1));
            if (personSearch?.hits?.[0]) {
              holderArticle = await withTimeout(fetchWikiSummary(personSearch.hits[0].title));
            }
          }
        }
      }
      // Fallback: search "current [role]"
      if (!holderArticle?.extract) {
        const searchResult = await withTimeout(searchWiki(`current ${entity}`, 3));
        const bestHit = searchResult?.hits?.find(h => !h.title.toLowerCase().includes("list of"));
        if (bestHit) holderArticle = await withTimeout(fetchWikiSummary(bestHit.title));
      }

      if (holderArticle?.extract && holderArticle.type !== "disambiguation") {
        const { truncated } = truncateExtract(holderArticle.extract);
        provenance.push({ ...wikiProvenance(holderArticle), latencyMs: Date.now() - startMs });
        blocks.push({ type: "wikipedia", content: truncated, wasTruncated: false, title: holderArticle.title });
        const leadIn = pickVariant(FACT_LEAD_INS, "fact-lead-in", memory, seed);
        yield* streamFramingAndText(leadIn, truncated);
        // REMOVED: wikipedia text already in delta stream, no block event needed;
      } else {
        memory.failureStreak++;
        yield* streamText(pickVariant(NOT_FOUND, "not-found", memory, seed), seed);
      }
      yield { event: "provenance", data: { sources: provenance } };
      yield { event: "done", data: buildEnvelope("structured_fact", blocks, provenance, startMs) };
      return;
    }

    yield* status(`Looking up ${entity}...`, "wikipedia");
    const wikiResult = await withTimeout(searchAndFetch(entity));

    if (!wikiResult || !wikiResult.wikibaseItem) {
      memory.failureStreak++;
      const msg = fillSlots(
        pickVariant(NOT_FOUND, "not-found", memory, seed),
        { sourceCount: "2", ms: String(Date.now() - startMs), term: entity }
      );
      yield* streamText(msg, seed);
      yield { event: "done", data: buildEnvelope("structured_fact", blocks, provenance, startMs) };
      return;
    }

    yield* status(`Fetching ${label} from Wikidata...`, "wikidata");
    const factValue = await withTimeout(
      fetchFirstProperty(wikiResult.wikibaseItem, properties.length ? properties : ["P569"])
    );

    if (!factValue) {
      // Fall back to extract
      const { truncated } = truncateExtract(wikiResult.extract);
      provenance.push({ ...wikiProvenance(wikiResult), latencyMs: Date.now() - startMs });
      const leadIn = pickVariant(FACT_LEAD_INS, "fact-lead-in", memory, seed);
      yield* streamFramingAndText(leadIn, truncated);
      blocks.push({ type: "wikipedia", content: truncated, wasTruncated: true, title: wikiResult.title });
    } else {
      const formatted = await formatValue(factValue);
      provenance.push({ ...wikiProvenance(wikiResult), latencyMs: Date.now() - startMs });
      provenance.push({
        ...wikidataProvenance(wikiResult.wikibaseItem),
        latencyMs: Date.now() - startMs,
      });
      memory.failureStreak = 0;
      yield* streamText(`**${wikiResult.title}** — ${label}: **${formatted}**`, seed);
    }

    yield { event: "provenance", data: { sources: provenance } };
    yield { event: "done", data: buildEnvelope("structured_fact", blocks, provenance, startMs) };
    return;
  }

  // ------------------------------------------------------------------
  // LOOKUP — the general factual case
  // ------------------------------------------------------------------

  if (classified.intent === "lookup" || classified.intent === "unknown") {
    const query = classified.residual || raw.trim();

    // Detect keyboard mash
    if (looksLikeKeyboardMash(query) && query.length > 6) {
      const msg = fillSlots(
        pickVariant(KEYBOARD_MASH, "keyboard-mash", memory, seed),
        { term: query, sourceCount: "3", ms: String(Date.now() - startMs) }
      );
      yield* streamText(msg, seed);
      yield { event: "done", data: buildEnvelope(classified.intent, blocks, provenance, startMs) };
      return;
    }

    if (classified.intent === "unknown") {
      const msg = pickVariant(UNPARSEABLE, "unparseable", memory, seed);
      memory.failureStreak++;
      if (memory.failureStreak >= 3) {
        const rider = pickVariant(FAILURE_STREAK_RIDER, "failure-streak", memory, seed);
        yield* streamText(`${msg}\n\n${rider}`, seed);
      } else {
        yield* streamText(msg, seed);
      }
      yield { event: "done", data: buildEnvelope("unknown", blocks, provenance, startMs) };
      return;
    }

    yield* status("Searching Wikipedia...", "wikipedia");

    // --- Pre-search query normalization ---

    // 1. "who killed/shot/assassinated X" → route to "[X] assassination" or "[X] death"
    //    This catches "who killed JFK" → "John F. Kennedy assassination"
    //    rather than finding the "Killing" disambiguation page.
    const assassinMatch = query.match(/^(?:who\s+)?(?:killed|shot|assassinated|murdered|executed)\s+(.+)$/i)
    if (assassinMatch) {
      const target = assassinMatch[1].trim()
      const eventQuery = `${target} assassination`
      // Short-circuit: search for the assassination event directly
      yield* status(`Looking up ${target}...`, "wikipedia")
      const assSearch = await withTimeout(searchWiki(eventQuery, 3))
      const bestAss = assSearch?.hits?.find(h =>
        /assassination|killing|death|murder/i.test(h.title) ||
        h.title.toLowerCase().includes(target.toLowerCase().split(/\s+/).pop() ?? "")
      ) ?? assSearch?.hits?.[0]
      if (bestAss) {
        const assArticle = await withTimeout(fetchWikiSummary(bestAss.title))
        if (assArticle?.extract && assArticle.type !== "disambiguation") {
          const { truncated } = truncateExtract(assArticle.extract)
          provenance.push({ ...wikiProvenance(assArticle), latencyMs: Date.now() - startMs })
          blocks.push({ type: "wikipedia", content: truncated, wasTruncated: false, title: assArticle.title })
          memory.failureStreak = 0
          yield* streamText(truncated, seed)
          // REMOVED: wikipedia text already in delta stream, no block event needed
          yield { event: "provenance", data: { sources: provenance } }
          yield { event: "done", data: buildEnvelope("lookup", blocks, provenance, startMs) }
          return
        }
      }
      // Fall through if no good result
    }

    // 2. Clean up residuals left by scaffold stripping that still have leading auxiliary verbs.
    // "why do we have seasons" → scaffold strips "why do we" → residual "have seasons"
    // → strip leading "have/has/do/does/did/get/need/contain" → "seasons"
    const cleanedQuery = query
      .replace(/^(?:have|has|had|do|does|did|get|gets|got|need|needs|contain|contains|include|includes)\s+/i, "")
      .replace(/\s+(?:does|do|did|is|are|was|were|have|has)\s+/g, " ")  // "moons does jupiter" → "moons jupiter"
      .trim() || query;
    const queryForSearch = cleanedQuery !== query ? cleanedQuery : query;

    // Pre-fetch: try the residual as a direct Wikipedia article title BEFORE any search.
    // "great barrier reef" → redirects to "Great Barrier Reef" (correct), not "Coral reef".
    // "north star" → redirects to "Polaris", not "Fist of the North Star" manga.
    // Only for multi-word residuals — single words are handled in the search loop below.
    if (queryForSearch.split(/\s+/).length >= 2) {
      const prefetch = await withTimeout(fetchWikiSummary(queryForSearch));
      const prefetchIsClean = prefetch?.extract &&
        prefetch.type !== "disambiguation" &&
        !/\(film\)|\(song\)|\(TV\s*series\)|\(manga\)|\(anime\)|\(video\s*game\)/i.test(prefetch.title);
      if (prefetchIsClean) {
        const { truncated, wasTruncated } = truncateExtract(prefetch!.extract);
        provenance.push({ ...wikiProvenance(prefetch!), latencyMs: Date.now() - startMs });
        blocks.push({ type: "wikipedia", content: truncated, wasTruncated, title: prefetch!.title });
        memory.failureStreak = 0;
        const leadIn = pickVariant(FACT_LEAD_INS, "fact-lead-in", memory, seed);
        yield* streamFramingAndText(leadIn, truncated);
        yield { event: "provenance", data: { sources: provenance } };
        yield { event: "done", data: buildEnvelope("lookup", blocks, provenance, startMs) };
        return;
      }
    }

    // ---- SUBJECT EXTRACTION ----
    // The single most important function: identify the NOUN PHRASE being asked about,
    // not the question scaffold around it. "yo wtf is the bermuda triangle" → "bermuda triangle".
    // "can humans survive on mars" → "mars". "is coffee bad for you" → "coffee".
    // This prevents slang/filler/opinion words from polluting the Wikipedia search.
    const SUBJECT_STOP = new Set([
      // Slang and filler
      "yo","wtf","tf","af","lol","omg","bruh","dude","bro","huh","smh","ngl","tbh",
      "lowkey","highkey","literally","basically","honestly","actually","seriously","wait",
      // Question words and scaffolds
      "what","who","how","why","when","where","which","whose","whom",
      "whats","whos","hows","whys","wheres","whens",
      // Modal and auxiliary verbs
      "is","are","was","were","be","been","being","am",
      "can","could","should","would","will","shall","may","might","must",
      "do","does","did","have","has","had",
      // Common action verbs — when used as question structure (not subject)
      "invented","invent","invents","discovered","discover","made","make","makes",
      "died","die","dies","born","killed","kill","kills","went","go","goes","gone",
      "survive","survived","survives","created","create","creates","found","find",
      "mean","means","happened","happen","works","work","form","forms","came","come",
      "become","became","get","got","gotten","turn","turned","turning","start","started",
      "cause","caused","causes","produce","produced","produces","affect","affects",
      "part","section","piece","area","region","place","thing","stuff","matter",
      // Motion/state verbs — not subjects in typical question context
      "run","runs","ran","heal","heals","healed","healing","float","floats","sink","sinks",
      "hurt","hurts","break","breaks","broke","grow","grows","grew","fight","fights",
      "stay","stays","stayed","keep","keeps","kept","hold","holds","held",
      "fall","falls","fell","rise","rises","rose","drop","drops","dropped",
      "spin","spins","spun","turn","turns","turned","move","moves","moved",
      "own","themselves","itself","myself","yourself","ourselves","yourselves",
      // Directional particles — never subject nouns
      "up","down","out","away","back","around","together","apart","open","shut",
      // Temporal filler
      "now","then","soon","later","today","yesterday","tomorrow","always","never",
      "sometimes","often","usually","generally","normally","typically","basically",
      // Opinion / evaluative words — never the subject
      "bad","good","best","worst","better","worse","great","terrible","awful","amazing",
      "richer","rich","poorer","poor","safe","unsafe","healthy","unhealthy","dangerous",
      "useful","useless","important","unimportant","true","false","right","wrong",
      // Filler/generic nouns that aren't subjects
      "humans","human","people","person","someone","anyone","everyone","nobody",
      "you","me","we","us","they","them","he","she","it","one",
      "things","thing","objects","object","stuff","items","item","examples","example",
      "owners","owner","users","user","viewers","viewer","readers","reader",
      "everyone","anyone","nobody","somebody","themselves",
      // Action nouns that appear as question scaffolding but aren't subjects
      "crash","crashes","crashing","collision","accident","disaster","incident",
      // Evaluative state/emotion adjectives — not the subject entity
      "tired","exhausted","sleepy","hungry","thirsty","bored","sick","healthy","alive","dead",
      "happy","sad","angry","scared","excited","nervous","anxious","depressed","lonely","upset",
      "crazy","weird","strange","normal","natural","artificial","organic","digital","virtual",
      // Negation words
      "not","never","no","none","neither","nor","without","except","unless","hardly","barely",
      // Articles, prepositions, conjunctions
      "the","a","an","of","in","on","at","to","for","with","by","from","about","into",
      "through","during","before","after","above","below","between","out","off","over",
      "and","or","but","nor","yet","so","both","either","neither","than","then",
      // Common adverbs used as filler
      "just","only","really","very","quite","too","also","still","already","always",
      "never","often","ever","even","enough","kind","sort","type","way","bit",
      // Comparative/superlative fillers (the noun after these is the subject)
      "most","least","more","less","much","many","few","little","some","any","all",
      "largest","biggest","smallest","tallest","shortest","fastest","slowest","oldest",
      "newest","heaviest","lightest","deepest","highest","lowest","longest","widest",
      // Descriptive/evaluative adjectives — not the subject noun
      // "is coffee bad for you" → "bad" removed → "coffee"
      // "why is the ocean salty" → "salty" removed → "ocean"
      "bad","good","safe","unsafe","dangerous","harmful","healthy","unhealthy","toxic",
      "salty","sweet","sour","bitter","spicy","hot","cold","warm","cool","wet","dry",
      "deep","shallow","wide","narrow","thick","thin","heavy","light","rough","smooth",
      "hard","soft","fast","slow","quick","strong","weak","bright","dark","loud","quiet",
      "clean","dirty","fresh","stale","raw","cooked","alive","dead","sick","well","fit",
      "big","small","large","tiny","huge","vast","giant","massive","enormous","microscopic",
      // These appear as evaluative framing, not subject:
      "for","you","bad","good","safe","dangerous","harmful","unhealthy","healthy","useful",
    ])

    // Extract the subject noun phrase from a query by removing all non-subject words
    const extractSubject = (rawQ: string): string => {
      const tokens = rawQ.toLowerCase()
        .replace(/[?!.,'"]+/g, " ")
        .split(/\s+/)
        .filter(t => t.length > 1)
      const content = tokens.filter(t => !SUBJECT_STOP.has(t.replace(/[^a-z]/g, "")))
      return content.join(" ").trim()
    }

    // Extract the best searchable term from the raw query.
    // For how-to queries ("how do you make pasta"), extract the object noun phrase.
    // For superlative queries ("what is the tallest building"), extract the core noun.
    const extractSearchTerm = (q: string): string[] => {
      const terms: string[] = [q];
      // Strip leading how-to scaffolding to get the main noun
      const howTo = q.replace(/^(?:how\s+(?:do(?:es)?(?:\s+(?:one|you|i|we))?|can\s+(?:you|i|we)|to|should\s+(?:you|i|we))\s+(?:make|build|create|do|write|draw|use|fix|solve|find|get|learn|understand|explain|describe)\s+)/i, "").trim();
      if (howTo !== q && howTo.length > 2) terms.push(howTo);
      // Strip superlatives: "tallest building in the world" → "building"
      const supMatch = q.match(/\b(most|least|best|worst|biggest|smallest|largest|tallest|shortest|fastest|slowest|oldest|newest|richest|poorest|famous|popular|common|important|notable|well-?known)\b/i);
      const noSuperlative = q.replace(/\b(?:most|least|best|worst|biggest|smallest|largest|tallest|shortest|fastest|slowest|oldest|newest|richest|poorest|famous|popular|common|important|notable|well-?known)\b\s*/gi, "").trim();
      if (noSuperlative !== q && noSuperlative.length > 2) {
        terms.push(noSuperlative);
        // Also try "list of [superlative] [noun]" — often the best Wikipedia article for these
        if (supMatch) terms.push(`list of ${supMatch[1]} ${noSuperlative}`);
      }
      // Strip "in the world/US/etc" tails
      const noLocation = q.replace(/\s+(?:in|of|around)\s+(?:the\s+)?(?:world|earth|us|usa|america|history|all\s+time|all\s+history)\s*$/i, "").trim();
      if (noLocation !== q && noLocation.length > 2) terms.push(noLocation);
      // "food in france" → "french cuisine"
      const countryFoodMatch = q.match(/\b(?:food|cuisine|dish|meal|eat)\b.+\bin\s+([a-z]+)\s*$/i);
      if (countryFoodMatch) terms.push(`${countryFoodMatch[1]} cuisine`);
      // "famous X in Y" → extract X category
      const inCountry = q.match(/\b(?:famous|popular|common|typical|traditional|iconic)\b.+?\b((?:food|dish|sport|music|art|building|landmark|city|animal|plant)\b.+)$/i);
      if (inCountry) terms.push(inCountry[1]);
      // Strip filler adjectives from the front: "simple circuit" → "circuit"
      const noFiller = q.replace(/^(?:simple|basic|easy|quick|small|tiny|short|brief|little|common|typical|standard|general|normal|plain)\s+/i, "").trim();
      if (noFiller !== q && noFiller.length > 2) terms.push(noFiller);
      // Strip leading process/cause verbs: "causes rain" → "rain", "affects climate" → "climate"
      const noLeadingVerb = q.replace(/^(?:make|makes|build|create|do|does|write|draw|use|fix|solve|find|get|learn|understand|explain|describe|calculate|compute|cause|causes|caused|affect|affects|form|forms|occur|occurs|happen|happens|produce|produces|involve|involves)\s+(?:a\s+|an\s+|the\s+)?/i, "").trim();
      if (noLeadingVerb !== q && noLeadingVerb.length > 2) terms.push(noLeadingVerb);
      const noVerb = noLeadingVerb;
      // For "[noun] [verb]" residuals (how-do scaffold), nominalize the trailing verb FIRST —
      // "planes fly" → "flight" → search "flight" returns "Flight" article (correct).
      // This must come BEFORE the bare noun strip so we prefer "flight" over "planes".
      {
        const VERB_TO_CONCEPT: Record<string, string> = {
          fly: "flight", flies: "flight", flew: "flight",
          swim: "swimming", swims: "swimming",
          grow: "growth", grows: "growth",
          burn: "combustion", burns: "combustion",
          breathe: "respiration", breathes: "respiration",
          digest: "digestion", digests: "digestion",
          beat: "cardiac cycle", beats: "cardiac cycle",
          evolve: "evolution", evolves: "evolution",
          reproduce: "reproduction",
          move: "motion", moves: "motion",
          orbit: "orbital mechanics", orbits: "orbital mechanics",
          circulate: "circulation",
          photosynthesize: "photosynthesis",
          rust: "corrosion",
          melt: "melting point", melts: "melting point",
          boil: "boiling point", boils: "boiling point",
          // Life/death verbs — point to scientific processes, not entertainment titles
          die: "death", dies: "death", died: "death",
          age: "aging", ages: "aging", aged: "aging",
          form: "formation", forms: "formation",
          collapse: "gravitational collapse", collapses: "gravitational collapse",
          shine: "nuclear fusion", shines: "nuclear fusion",  // why stars shine → nuclear fusion
          float: "buoyancy", floats: "buoyancy",              // why ice floats → buoyancy
          stay: "aerodynamics", stays: "aerodynamics",       // how planes stay up → aerodynamics
        }
        const lastWord = q.split(/\s+/).pop()?.toLowerCase() ?? ""
        if (lastWord && VERB_TO_CONCEPT[lastWord]) {
          const concept = VERB_TO_CONCEPT[lastWord]
          const firstWord = q.split(/\s+/)[0]
          // Push compound FIRST (more specific: "stars death") then lone concept as fallback
          if (firstWord && firstWord !== lastWord) {
            const combined = `${firstWord} ${concept}`
            if (!terms.includes(combined)) terms.push(combined)
          }
          if (!terms.includes(concept)) terms.push(concept)
        }
        // For "X [verb] on/in/through Y" patterns, add the SUBJECT X FIRST (before compound terms)
      // "ice float on water" → "ice" should be the primary search, not "ice cream float"
      // "fish swim in ocean" → "fish"
      const onInMatch = q.match(/^(\w+)\s+\w+\s+(?:on|in|through|into|across|over|under|with)\s+\w+$/i)
      if (onInMatch) {
        const subject = onInMatch[1]
        const qWords = q.split(/\s+/)
        const nextWord = qWords[1]
        // Try 2-word compound first (more specific): "black holes" before "black"
        // This way "black holes in space" → "black holes" → "Black hole" article
        // instead of "black" → "Black" (color) article
        if (nextWord && nextWord !== subject) {
          const compound = `${subject} ${nextWord}`
          if (!terms.includes(compound)) terms.splice(0, 0, compound)
          if (!terms.includes(subject)) terms.splice(1, 0, subject)
        } else {
          if (!terms.includes(subject)) terms.splice(0, 0, subject)
        }
      }
      }
      // For "why do X verb Y" queries: extract X (the subject) as a standalone search term.
      // "vaccines cure diseases" → "vaccines" finds the Vaccine article (mechanism).
      // "leaves change color" → "leaves" as subject, but also try "autumn leaf color" (phenomenon).
      // Pattern: subject verb object (2+ content words, middle is a verb)
      const svoMatch = q.match(/^(\w+(?:\s+\w+)?)\s+(?:cure|cures|prevent|prevents|cause|causes|fight|fights|destroy|destroys|affect|affects|change|changes|turn|turns|produce|produces|create|creates|kill|kills|help|helps|protect|protects)\s+(.+)$/i)
      if (svoMatch) {
        const subject = svoMatch[1].trim()
        const object = svoMatch[2].trim()
        // Add "[subject] [object]" as phenomenon search (e.g. "leaves color" → "autumn leaf color")
        if (!terms.includes(subject)) terms.push(subject)
        // For color-change queries: try the specific phenomenon "autumn leaf color"
        // "leaves change color" → "autumn leaf color" is a real Wikipedia article
        if (/color|colour|orange|red|yellow|green|brown/i.test(object) ||
            /change|turn|become/i.test(svoMatch[0].split(/\s+/)[1] || "")) {
          const singular = subject.replace(/s$/, "")  // leaves → leaf
          terms.push(`autumn ${singular} color`)
          terms.push(`${subject} color change`)
        }
      }

      // Strip trailing verbs/process words: "vaccines work" → "vaccines", "plants grow" → "plants"
      const noTrailingVerb = q.replace(/\s+(?:work|works|function|functions|happen|happens|occur|occurs|form|forms|grow|grows|move|moves|change|changes|spread|spreads|cause|causes|affect|affects|develop|develops|operate|operates|fly|flies|float|floats|swim|swims|run|runs|live|lives|survive|survives|reproduce|reproduces|made|built|produced|manufactured|created|formed|processed|invented|discovered|evolved|shine|shines|shone|glow|glows|burn|burns|spin|spins|rotate|rotates|die|dies|died|age|ages|formed|appear|appears|turn|turns|cure|cures|prevent|prevents|fight|fights|destroy|destroys|kill|kills)\s*$/i, "").trim();
      if (noTrailingVerb !== q && noTrailingVerb.length > 2) terms.push(noTrailingVerb);
      // Strip trailing adjectives from "the sky blue" → "sky"
      const noTrailingAdj = q.replace(/\s+(?:blue|red|green|yellow|white|black|dark|light|bright|hot|cold|warm|cool|big|small|fast|slow|high|low|long|short|old|new|good|bad)\s*$/i, "").trim();
      if (noTrailingAdj !== q && noTrailingAdj.length > 2) terms.push(noTrailingAdj);
      // "X of Y" → also try Y alone ("symptoms of adhd" → "adhd", "history of rome" → "rome")
      const ofPattern = q.match(/^(?:\w+\s+)+of\s+(.+)$/i);
      if (ofPattern) terms.push(ofPattern[1].trim());
      // General content-word extraction: strip English stopwords, search remaining key nouns.
      // This handles informal/descriptive queries ("the thing in space with gravitational pull"
      // → "space gravitational pull" → Wikipedia finds "Gravity") without hardcoding mappings.
      // Subject extraction using the comprehensive SUBJECT_STOP set.
      // This is the primary fix for "yo wtf is the bermuda triangle" → "bermuda triangle",
      // "can humans survive on mars" → "mars", "is coffee bad for you" → "coffee", etc.
      // It strips ALL non-subject words (slang, opinion, modals, filler nouns) leaving
      // only the noun phrase being asked about.
      const subjectPhrase = extractSubject(q)
      // Only insert as first term if it's a meaningful subject:
      // - Multi-word phrase (e.g. "bermuda triangle") → always insert
      // - Single word with ≥4 chars (e.g. "mars", "coffee") → insert; avoids short ambiguous words
      //   like "age" (→ "The Age" newspaper) or "run" (→ track/river context)
      const subjectWords = subjectPhrase.split(/\s+/).filter(Boolean)
      const subjectMeaningful = subjectWords.length >= 2 || (subjectWords.length === 1 && subjectPhrase.length >= 4)
      if (subjectPhrase && subjectPhrase !== q && subjectMeaningful && !terms.includes(subjectPhrase)) {
        terms.splice(0, 0, subjectPhrase)
      }

      const STOPWORDS = new Set([
        "a","an","the","is","are","was","were","be","been","being","have","has","had",
        "do","does","did","will","would","could","should","may","might","shall","can",
        "of","in","on","at","to","for","with","by","from","up","about","into","through",
        "during","before","after","above","below","between","out","off","over","under",
        "this","that","these","those","it","its","and","or","but","not","very","just",
        "most","other","some","such","than","too","also","any","all","both","each","few",
        "more","no","so","yet","either","one","what","which","who","when","where","why",
        "how","i","me","we","you","he","she","they","my","your","his","her","our","their",
        "us","him","them","if","then","else","get","got","go","goes","went","come","came",
        "take","give","see","know","think","want","use","used","make","made","like","just",
        "there","here","now","then","than","into","onto","upon","since","while","although",
        "because","as","after","before","behind","between","among","around","along","across",
        "really","quite","rather","pretty","fairly","somewhat","much","many","few","little",
        "tell","let","put","set","show","find","found","look","say","said","said",
        "thing","things","kind","sort","type","way","ways","something","anything","everything",
        "nothing","someone","anyone","everyone","nobody","somewhere","anywhere","everywhere",
      ])
      const contentWords = q.split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w.toLowerCase()))
      const contentQuery = contentWords.join(" ")
      if (contentQuery && contentQuery !== q && contentQuery.length > 2) {
        terms.push(contentQuery)
      }
      // Also try the longest individual content word — often the most specific technical term
      // ("gravitational" → Wikipedia finds "Gravity"; "petroleum" handles "oil" synonyms)
      if (contentWords.length > 1) {
        const longest = contentWords.reduce((a, b) => a.length >= b.length ? a : b)
        if (longest.length > 4 && !terms.includes(longest)) terms.push(longest)
      }
      // Strip leading article/adj: "the sky blue" → "sky blue"
      const noLeadingThe = q.replace(/^(?:the|a|an)\s+/i, "").trim();
      if (noLeadingThe !== q && noLeadingThe.length > 2) terms.push(noLeadingThe);
      // Strip both leading "the" AND trailing adj: "the sky blue" → "sky"
      const noLeadingAndTrailing = noTrailingAdj.replace(/^(?:the|a|an)\s+/i, "").trim();
      if (noLeadingAndTrailing !== noTrailingAdj && noLeadingAndTrailing.length > 2) terms.push(noLeadingAndTrailing);
      // Deduplicate while preserving order
      return [...new Set(terms)];
    };

    // For "why"/"how" scaffold queries, add the scaffold word back as a search prefix
    // so Wikipedia's ranking finds explanatory articles, not entertainment titles.
    // The full normalized query is always the FIRST search term — Wikipedia's search handles
    // natural language very well and "why is the sky blue" → "Diffuse sky radiation" is correct,
    // while searching the stripped residual "sky blue" finds the color article.
    // We use a PERMISSIVE threshold for this term (0.3) since Wikipedia's top result is usually
    // relevant even when token overlap is partial (function words stripped from the score).
    // Derived/simplified terms use a STRICT threshold (0.45) to block false positives like films.
    const scaffoldKind = classified.scaffoldKind;
    void scaffoldKind;
    const fullQuery = classified.normalized;  // full cleaned query e.g. "why is the sky blue"
    const baseSearchTerms = extractSearchTerm(queryForSearch);   // residual-derived fallbacks

    // Query ordering strategy:
    // HOW-DO / WHY-DO (action queries): derived terms first — verb-nominalization finds the
    //   scientific concept ("flight" for "planes fly", "death" for "stars die"). Wikipedia's
    //   search for "how do X verb" / "why do X verb" reliably returns films/songs.
    // WHY-IS / WHAT / other (property/state queries): full query first — Wikipedia handles
    //   "why is the sky blue" → "Diffuse sky radiation" correctly.
    const isActionQuery = /^(?:how\s+(?:do|does|did)|why\s+(?:do|does|did|can|can't|doesn't))\s/i.test(raw);
    const searchTerms: string[] = [];

    // Extract subject phrase (first element of baseSearchTerms if it was inserted by SUBJECT_STOP)
    const subjectPhrase = baseSearchTerms[0] !== queryForSearch ? baseSearchTerms[0] : null;
    const subjectIsMultiWord = subjectPhrase && subjectPhrase.split(/\s+/).length >= 2;

    if (isActionQuery) {
      // Action queries (how do, why do): derived/nominalized terms first, full query last
      for (const t of baseSearchTerms) if (!searchTerms.includes(t)) searchTerms.push(t);
      if (fullQuery && !searchTerms.includes(fullQuery)) searchTerms.push(fullQuery);
    } else if (subjectIsMultiWord) {
      // "what is X" with a clear multi-word subject (e.g. "north star", "great barrier reef"):
      // Try the subject phrase FIRST via direct fetch — avoids "Fist of the North Star" beating
      // "Polaris" when the full query "what is the north star" is searched and both words match.
      // Direct fetch of "north star" → "Polaris" (via Wikipedia redirect) is always correct.
      searchTerms.push(subjectPhrase);
      if (fullQuery && fullQuery !== queryForSearch) searchTerms.push(fullQuery);
      for (const t of baseSearchTerms) {
        if (!searchTerms.includes(t)) searchTerms.push(t);
      }
    } else {
      // Other queries: full query first
      if (fullQuery && fullQuery !== queryForSearch) searchTerms.push(fullQuery);
      for (const t of baseSearchTerms) if (!searchTerms.includes(t)) searchTerms.push(t);
    }
    if (!searchTerms.length) searchTerms.push(queryForSearch);

    // Returns true if a search result title looks like entertainment that should be
    // deprioritized when the query is about a concept, mechanism, or process
    const isEntertainmentTitle = (title: string, q: string): boolean => {
      // Only deprioritize entertainment when the query has no entertainment context
      const entertainmentQuery = /\bfilm\b|\bmovie\b|\bshow\b|\bseries\b|\bsong\b|\balbum\b|\bband\b|\bgame\b|\bnovel\b|\bbook\b|\bcharacter\b/i
      if (entertainmentQuery.test(q)) return false  // query IS about entertainment

      // Explicit disambiguation markers
      if (/\(film\)|\(TV\s*series\)|\(song\)|\(album\)|\(band\)|\(video\s*game\)|\(book\)|\(novel\)|\(TV\s*show\)|\(miniseries\)|\(soundtrack\)/i.test(title)) return true

      // "Planes 2", "Cars 3", etc. — numbered sequel format
      if (/^[A-Z][a-z]+\s+\d+:/.test(title)) return true

      // TV show season format: "The Boys season 5", "Stranger Things Season 4"
      if (/\bseason\s+\d+\b|\bseries\s+\d+\b/i.test(title)) return true

      // Exclamation-mark titles: "Airplane!", "Grease!", "Oklahoma!" — almost always entertainment
      if (/!+$/.test(title)) return true

      // Business/strategy books when query is about natural phenomena
      // "Blue Ocean Strategy" for "why is the ocean blue" — query has nature words but title has business
      const naturalPhenomenonQ = /\b(sky|ocean|sea|water|ice|fire|snow|rain|sun|moon|earth|cloud|wind|color|colour|plant|animal|human|body|cell|atom|bone|muscle|organ|blood|light|sound|heat|cold|warm|energy)\b/i
      const businessTitle = /\b(strategy|strategies|management|marketing|corporate|business|economy|economics|investment|brand|startup|entrepreneur|leadership|company|companies|market|finance|financial)\b/i
      if (businessTitle.test(title) && naturalPhenomenonQ.test(q) && !businessTitle.test(q)) return true

      // "Planes: Fire & Rescue" — query's main noun + colon + capitalized subtitle
      // Catches entertainment spin-offs that don't have explicit "(film)" disambiguation
      const queryNounToken = q.toLowerCase().split(/\s+/)
        .filter(t => t.length > 3 && !STOP.has(t))
        .find(t => title.toLowerCase().startsWith(t) || title.toLowerCase().startsWith(t.slice(0, -1)))
      if (queryNounToken && title.includes(':')) return true

      return false
    }
    // STOP used in isEntertainmentTitle (same as scoreHit for consistency)
    const STOP = new Set([
      "the","a","an","is","are","was","were","of","in","on","at","to","do","does","did",
      "and","or","but","for","with","by","from","what","which","who","when","where","why","how",
      "i","me","we","us","you","he","him","she","her","they","them","it","its",
      "my","your","his","our","their","this","that",
    ])

    // Score a Wikipedia search hit against our query for relevance (higher = better match)
    const scoreHit = (hitTitle: string, q: string): number => {
      // Immediately reject entertainment disambiguation when query is not about entertainment
      if (isEntertainmentTitle(hitTitle, q)) return 0
      const titleLower = hitTitle.toLowerCase();
      // Extended STOP set — question words and pronouns must not drive scores.
      // Without this, "Why Don't We" scores 0.57 for "why do we have seasons"
      // because "why" and "we" appear in both. With these in STOP, they're filtered out.
      const STOP = new Set([
        "the","a","an","is","are","was","were","of","in","on","at","to","do","does","did",
        "and","or","but","for","with","by","from","as","into","than","so","yet","if",
        "what","which","who","whom","whose","when","where","why","how",
        "i","me","we","us","you","he","him","she","her","they","them","it","its",
        "my","your","his","our","their","this","that","these","those",
        "have","has","had","will","would","could","should","may","might","can",
        "be","been","being","not","no","nor","very","just","also",
        "do","don't","doesn't","didn't","won't","can't","isn't","aren't","wasn't",
        // Descriptive adjectives — when asked "why is fire HOT", "hot" shouldn't match "Hot Space"
        "hot","cold","warm","cool","big","small","large","tiny","fast","slow",
        "dark","bright","light","heavy","hard","soft","loud","quiet","deep","high",
        "red","blue","green","black","white","yellow","orange","purple","gray",
        "old","new","young","long","short","far","near","good","bad","great",
        "wet","dry","sharp","dull","thick","thin","full","empty","clean","dirty",
      ]);
      const qTokens = q.toLowerCase().split(/\s+/).filter(t => t.length > 1 && !STOP.has(t));
      const titleTokens = titleLower.split(/\s+/).filter(t => t.length > 1 && !STOP.has(t));
      if (!qTokens.length || !titleTokens.length) return 0;
      // Use first 6 chars as pseudo-stem: "gravity"→"gravit", "gravitational"→"gravit" → match
      const stem = (w: string) => w.slice(0, Math.min(w.length, 6));
      const tokenMatches = (a: string, b: string) =>
        a.includes(b) || b.includes(a) || stem(a) === stem(b);
      const matches = qTokens.filter(qt => titleTokens.some(tt => tokenMatches(qt, tt))).length;
      const recall = matches / qTokens.length;
      const titleMatches = titleTokens.filter(tt => qTokens.some(qt => tokenMatches(qt, tt))).length;
      const precision = titleMatches / titleTokens.length;
      return recall > 0 && precision > 0 ? 2 * recall * precision / (recall + precision) : 0;
    };



    // Try each search term in order, use first that gets a real Wikipedia hit
    let summary = null;
    let usedTerm = query;
    for (let termIdx = 0; termIdx < searchTerms.length; termIdx++) {
      const term = searchTerms[termIdx];
      // Full natural language query (term 0): permissive threshold (0.3).
      // Wikipedia's search ranking is good; "Diffuse sky radiation" is the right answer for
      // "why is the sky blue" even though token overlap is only 0.4.
      // Derived/simplified terms: strict (0.55) to block films/songs with partial noun matches.
      // isFullQuery: true only when the full original query (with question scaffold intact) is being
      // searched. This gets the permissive MIN_SCORE=0.3 because Wikipedia's natural language search
      // handles it well. When fullQuery===queryForSearch (no scaffold was stripped, residual IS the
      // query), we use strict threshold to block entertainment false positives like "Hot Space".
      const isFullQuery = term === fullQuery && fullQuery !== queryForSearch;
      const MIN_SCORE = isFullQuery ? 0.3 : 0.55;

      const [direct, searched] = await Promise.all([
        withTimeout(fetchWikiSummary(term)),
        withTimeout(searchWiki(term, 5)),
      ]);

      // Direct hit takes priority if it's a real article AND not entertainment
      if (direct?.extract && direct.type !== "disambiguation" && !isEntertainmentTitle(direct.title, term)) {
        summary = direct;
        usedTerm = term;
        break;
      }

      // Score search hits and fetch best-matching one
      if (searched?.hits.length) {
        const scored = searched.hits
          .map(h => ({ hit: h, score: scoreHit(h.title, term) }))
          .sort((a, b) => b.score - a.score);
        const best = scored[0];
        if (best.score >= MIN_SCORE) {
          const candidate = await withTimeout(fetchWikiSummary(best.hit.title));
          if (candidate?.extract && candidate.type !== "disambiguation") {
            summary = candidate;
            usedTerm = term;
            break;
          }
        }
        // Score too low — fall through to next search term
      }

      // Keep disambiguation as a last resort if nothing better found
      if (!summary && direct) {
        summary = direct;
        usedTerm = term;
      }
    }

    // If still no result, try spell correction from the search suggestion
    if (!summary || !summary.extract) {
      const spellCheck = await withTimeout(searchWiki(query, 1));
      if (spellCheck?.suggestion) {
        const corrected = await withTimeout(fetchWikiSummary(spellCheck.suggestion));
        if (corrected?.extract) {
          summary = corrected;
          usedTerm = spellCheck.suggestion;
        }
      }
    }

    if (!summary || !summary.extract) {
      memory.failureStreak++;
      if (memory.failureStreak >= 3) {
        const rider = pickVariant(FAILURE_STREAK_RIDER, "failure-streak", memory, seed);
        const notFound = fillSlots(
          pickVariant(NOT_FOUND, "not-found", memory, seed),
          { sourceCount: "2", ms: String(Date.now() - startMs), term: query }
        );
        yield* streamText(`${notFound}\n\n${rider}`, seed);
      } else {
        const msg = fillSlots(
          pickVariant(NOT_FOUND, "not-found", memory, seed),
          { sourceCount: "2", ms: String(Date.now() - startMs), term: query }
        );
        yield* streamText(msg, seed);
      }
      yield { event: "done", data: buildEnvelope("lookup", blocks, provenance, startMs) };
      return;
    }
    // If we used a simplified term, note it for hedged framing
    const searchedWithFallback = usedTerm !== query;

    memory.failureStreak = 0;

    // Disambiguation: show clarify options instead of the disambiguation page text
    if (summary.type === "disambiguation") {
      yield* status("Multiple results found...", "wikipedia");
      const { fetchDabOptions } = await import("./sources/wikipedia");
      const dabOptions = await withTimeout(fetchDabOptions(summary.title)) ?? [];
      if (dabOptions.length > 0) {
        const clarifyQuestion = `Wikipedia lists ${dabOptions.length > 3 ? "several" : dabOptions.length} things called "${summary.title}" — which one?`;
        yield {
          event: "clarify",
          data: {
            question: clarifyQuestion,
            options: dabOptions.slice(0, 5).map((o) => ({
              label: o.title,
              description: o.description ?? "",
              query: o.query,
            })),
          },
        };
        const env = buildEnvelope("lookup", blocks, provenance, startMs);
        env.verdict = "clarified";
        env.clarify = { question: clarifyQuestion, options: dabOptions.slice(0, 5).map((o) => ({ label: o.title, description: o.description ?? "", query: o.query })) };
        yield { event: "done", data: env };
        return;
      }
      // No dab options — fall through and display the dab page text as-is
    }

    const isHedged = searchedWithFallback;
    const { truncated, wasTruncated } = truncateExtract(summary.extract);

    provenance.push({
      ...wikiProvenance(summary),
      latencyMs: Date.now() - startMs,
    });

    // ELI5: use the flag from the classifier (which strips the prefix before routing),
    // or fall back to checking the raw query for inline "explain like" / "simply" etc.
    const wantsSimple = classified.wantsSimple || /\b(explain like|simply|basic|beginner)\b/i.test(raw);
    let displayText = truncated;
    let leadIn: string;

    if (wantsSimple) {
      yield* status("Checking Simple Wikipedia...", "simple-wikipedia");
      const simpleResult = await withTimeout(fetchSimpleWikiSummary(summary.title));
      if (simpleResult && simpleResult.extract) {
        const { truncated: simpleTruncated } = truncateExtract(simpleResult.extract);
        displayText = simpleTruncated;
        leadIn = pickVariant(ELI5_SIMPLE_FRAMING, "eli5-framing", memory, seed);
        provenance.push({
          source: "simple-wikipedia",
          url: simpleResult.contentUrl,
          label: `Simple Wikipedia: ${simpleResult.title}`,
          fetchedAt: new Date().toISOString(),
        });
      } else {
        leadIn = pickVariant(ELI5_SIMPLE_MISSING, "eli5-missing", memory, seed);
      }
    } else if (isHedged) {
      leadIn = fillSlots(
        pickVariant(HEDGE_FRAMING, "hedge-framing", memory, seed),
        { title: summary.title }
      );
    } else {
      leadIn = pickVariant(FACT_LEAD_INS, "fact-lead-in", memory, seed);
    }

    // Recency disclaimer: only show when the QUERY itself mentions recent events
    // (not just because someone edited a historical article last week)
    let fullText = displayText;
    if (isRecentQuery && summary.revisionTimestamp) {
      const relTime = relativeTime(summary.revisionTimestamp);
      const disclaimer = fillSlots(
        pickVariant(RECENCY_DISCLAIMER, "recency-disclaimer", memory, seed),
        { relativeTime: relTime }
      );
      fullText = `${disclaimer}\n\n${displayText}`;
    }

    yield* streamFramingAndText(leadIn, fullText);

    const block: Block = {
      type: "wikipedia",
      content: truncated,
      wasTruncated,
      fullContent: wasTruncated ? summary.extract : undefined,
      title: summary.title,
    };
    blocks.push(block);
    yield { event: "block", data: block };

    if (wasTruncated) {
      const trunc = pickVariant(TRUNCATION_AFFORDANCE, "truncation", memory, seed);
      yield { event: "delta", data: { text: `\n\n${trunc}` } };
    }

    // Coref note
    if (classified.coref) {
      yield {
        event: "delta",
        data: { text: `\n\n*(I interpreted "${classified.coref.pronoun}" as ${classified.coref.resolvedTo})*` },
      };
    }

    assertProvenanceInvariant({
      verdict: "answered",
      intent: "lookup",
      provenance,
    });

    yield { event: "provenance", data: { sources: provenance } };
    yield { event: "done", data: buildEnvelope("lookup", blocks, provenance, startMs) };
    return;
  }

  // ------------------------------------------------------------------
  // FALLTHROUGH
  // ------------------------------------------------------------------

  const msg = pickVariant(UNPARSEABLE, "unparseable", memory, seed);
  memory.failureStreak++;
  yield* streamText(msg, seed);
  yield { event: "done", data: buildEnvelope(classified.intent, blocks, provenance, startMs) };
}

// ----- Builder helpers -----

function buildEnvelope(
  intent: string,
  blocks: Block[],
  provenance: ProvenanceEntry[],
  startMs: number
): AnswerEnvelope {
  return {
    id: crypto.randomUUID(),
    query: { raw: "", resolved: "" },
    intent,
    verdict: provenance.length > 0 ? "answered" : "declined",
    confidence: 1,
    answer: blocks.length > 0 ? { markdown: "", blocks } : null,
    clarify: null,
    provenance,
    coref: null,
    modifiersApplied: [],
    timing: { totalMs: Date.now() - startMs, perSource: {} },
  };
}

// ----- Local computation -----

function safeEval(expr: string, classified: ClassifyResult): number | null {
  // Use the expression from slots if available
  const raw = classified.slots.expression ?? expr;

  // Sanitize: only allow numbers, operators, parens, spaces, and common math
  const sanitized = raw
    .replace(/\^/g, "**")
    .replace(/[^0-9+\-*/.() %\s]/g, "");

  if (!sanitized.trim()) return null;

  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${sanitized})`)();
    if (typeof result === "number" && isFinite(result)) return result;
    return null;
  } catch {
    return null;
  }
}

function applyModifiers(result: number, classified: ClassifyResult): string {
  const modifiers = classified.modifiers ?? [];
  for (const mod of modifiers) {
    if (mod.kind === "format") {
      switch (mod.value) {
        case "binary":
          return `0b${Math.round(result).toString(2)}`;
        case "hex":
          return `0x${Math.round(result).toString(16).toUpperCase()}`;
        case "roman-numerals":
          return toRoman(Math.round(result));
        case "scientific":
          return result.toExponential();
        case "percentage":
          return `${(result * 100).toFixed(2)}%`;
        case "words":
          return numberToWords(result);
      }
    }
    if (mod.kind === "precision") {
      return result.toFixed(mod.decimals);
    }
  }
  // Default: smart formatting
  if (Number.isInteger(result)) return result.toString();
  return result.toPrecision(6).replace(/\.?0+$/, "");
}

function toRoman(n: number): string {
  if (n <= 0 || n > 3999) return String(n);
  const vals = [1000,900,500,400,100,90,50,40,10,9,5,4,1];
  const syms = ["M","CM","D","CD","C","XC","L","XL","X","IX","V","IV","I"];
  let result = "";
  let remaining = n;
  for (let i = 0; i < vals.length; i++) {
    while (remaining >= vals[i]) {
      result += syms[i];
      remaining -= vals[i];
    }
  }
  return result;
}

function numberToWords(n: number): string {
  if (!Number.isInteger(n) || Math.abs(n) > 999) return String(n);
  const ones = ["","one","two","three","four","five","six","seven","eight","nine",
    "ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
  const tens = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
  if (n === 0) return "zero";
  if (n < 0) return `negative ${numberToWords(-n)}`;
  if (n < 20) return ones[n];
  if (n < 100) return tens[Math.floor(n/10)] + (n % 10 ? `-${ones[n % 10]}` : "");
  return `${ones[Math.floor(n/100)]} hundred${n % 100 ? ` ${numberToWords(n % 100)}` : ""}`;
}

// ----- External source fetchers -----

type GeoResult = { name: string; lat: number; lon: number; timezone: string };

async function geocodeLocation(location: string): Promise<GeoResult | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;
  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) return null;
  const data = await res.json();
  const result = data?.results?.[0];
  if (!result) return null;
  return {
    name: result.name ?? location,
    lat: result.latitude,
    lon: result.longitude,
    timezone: result.timezone ?? "UTC",
  };
}

function getTimeForZone(timezone: string): { iso: string; display: string } {
  const now = new Date();
  const iso = now.toISOString();
  try {
    const display = now.toLocaleString("en-US", { timeZone: timezone, dateStyle: "full", timeStyle: "long" } as Intl.DateTimeFormatOptions);
    return { iso, display };
  } catch {
    return { iso, display: now.toUTCString() };
  }
}

type WeatherResult = Omit<import("./envelope").WeatherCardBlock, "type" | "location">;

async function fetchWeather(lat: number, lon: number, timezone: string): Promise<WeatherResult | null> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    timezone,
    forecast_days: "1",
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params}`;
  const res = await fetch(url, { next: { revalidate: 900 } });
  if (!res.ok) return null;
  const data = await res.json();
  const current = data?.current;
  if (!current) return null;

  const code = current.weather_code ?? 0;
  return {
    lat,
    lon,
    temperatureF: Math.round(current.temperature_2m ?? 0),
    weatherCode: code,
    description: weatherCodeToDesc(code),
    windSpeedMph: Math.round(current.wind_speed_10m ?? 0),
    timezone,
  };
}

function weatherCodeToDesc(code: number): string {
  if (code === 0) return "Clear sky";
  if (code <= 3) return "Partly cloudy";
  if (code <= 9) return "Foggy";
  if (code <= 12) return "Drizzle";
  if (code <= 19) return "Rain";
  if (code <= 29) return "Thunderstorm";
  if (code <= 39) return "Snow";
  if (code <= 49) return "Foggy";
  if (code <= 59) return "Drizzle";
  if (code <= 69) return "Rain";
  if (code <= 79) return "Snow";
  if (code <= 84) return "Rain showers";
  if (code <= 99) return "Thunderstorm";
  return "Unknown";
}

type RateResult = { rate: number; date: string };

async function fetchFiatRate(from: string, to: string): Promise<RateResult | null> {
  const url = `https://api.frankfurter.app/latest?from=${from}&to=${to}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return null;
  const data = await res.json();
  const rate = data?.rates?.[to];
  if (typeof rate !== "number") return null;
  return { rate, date: data.date ?? new Date().toISOString().slice(0, 10) };
}

async function fetchCryptoRate(from: string, to: string): Promise<RateResult | null> {
  const id = from.toLowerCase();
  const vsCurrency = to.toLowerCase();
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=${vsCurrency}`;
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) return null;
  const data = await res.json();
  const rate = data?.[id]?.[vsCurrency];
  if (typeof rate !== "number") return null;
  return { rate, date: new Date().toISOString().slice(0, 10) };
}

type PoemResult = { title: string; author: string; lines: string[] };

async function fetchPoem(): Promise<PoemResult | null> {
  // Random poem from PoetryDB — short poems preferred
  const url = "https://poetrydb.org/linecount/4,8,12,16/title,author,lines.json";
  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;
  const poem = data[Math.floor(Math.random() * Math.min(data.length, 20))];
  return {
    title: poem.title ?? "Untitled",
    author: poem.author ?? "Unknown",
    lines: Array.isArray(poem.lines) ? poem.lines : [],
  };
}

type SOHit = {
  title: string;
  score: number;
  link: string;
  hasAcceptedAnswer: boolean;
  tags: string[];
};

async function fetchStackOverflow(query: string): Promise<SOHit[] | null> {
  const params = new URLSearchParams({
    order: "desc",
    sort: "votes",
    q: query,
    site: "stackoverflow",
    pagesize: "5",
    filter: "withbody",
  });
  const url = `https://api.stackexchange.com/2.3/search/advanced?${params}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return null;
  const data = await res.json();
  const items = data?.items ?? [];
  return items.slice(0, 5).map((item: Record<string, unknown>) => ({
    title: String(item.title ?? ""),
    score: Number(item.score ?? 0),
    link: String(item.link ?? ""),
    hasAcceptedAnswer: Boolean(item.is_answered),
    tags: Array.isArray(item.tags) ? (item.tags as string[]).slice(0, 4) : [],
  }));
}

type WikiNewsItem = { title: string; extract: string };

async function fetchWikiNews(topic: string): Promise<WikiNewsItem[] | null> {
  // Use Wikipedia's search API filtered to recent articles
  const result = await searchWiki(topic, 5);
  if (!result.hits.length) return null;

  const articles = await Promise.all(
    result.hits.slice(0, 3).map((h) => withTimeout(fetchWikiSummary(h.title)))
  );

  const valid = articles.filter(Boolean) as NonNullable<typeof articles[0]>[];
  if (!valid.length) return null;

  return valid.map((a) => ({ title: a.title, extract: a.extract }));
}

type HNResult = {
  title: string;
  url: string;
  points: number;
  numComments: number;
  objectID: string;
  createdAt: string;
};

async function fetchHackerNews(query: string): Promise<HNResult[] | null> {
  const params = new URLSearchParams({
    query,
    tags: "story",
    hitsPerPage: "5",
  });
  const url = `https://hn.algolia.com/api/v1/search?${params}`;
  const res = await fetch(url, { next: { revalidate: 900 } });
  if (!res.ok) return null;
  const data = await res.json();
  const hits = data?.hits ?? [];
  return hits.slice(0, 5).map((h: Record<string, unknown>) => ({
    title: String(h.title ?? ""),
    url: String(h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`),
    points: Number(h.points ?? 0),
    numComments: Number(h.num_comments ?? 0),
    objectID: String(h.objectID ?? ""),
    createdAt: String(h.created_at ?? ""),
  }));
}
