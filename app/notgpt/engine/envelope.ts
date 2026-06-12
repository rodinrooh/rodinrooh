// envelope.ts — shared types for the notgpt engine and UI

export type ProvenanceEntry = {
  source: string;           // e.g. "wikipedia", "open-meteo", "wikidata"
  url: string;
  label: string;            // display name, e.g. article title
  fetchedAt: string;        // ISO timestamp of retrieval
  contentTimestamp?: string; // ISO timestamp of source's last edit, if known
};

// ---- Answer envelope (structured response from handler) ----

export type ClarifyOption2 = {
  label: string;
  description: string;
  query: string;
};

export type AnswerEnvelope = {
  id: string;
  query: { raw: string; resolved: string };
  intent: string;
  verdict: "answered" | "answered_hedged" | "clarified" | "declined";
  confidence: number;
  answer: { markdown: string; blocks: Block[] } | null;
  clarify: { question: string; options: ClarifyOption2[] } | null;
  provenance: ProvenanceEntry[];
  coref: { pronoun: string; resolvedTo: string } | null;
  modifiersApplied: string[];
  timing: { totalMs: number; perSource: Record<string, number> };
  trace?: unknown;
};

// Intents that are allowed to have empty provenance (local / static responses)
const LOCAL_INTENTS = new Set([
  "meta_self",
  "jailbreak",
  "roleplay",
  "creative_request",
  "safety",
  "easter_egg",
  "unknown",
]);

// Intents that can self-serve from local computation
const LOCAL_COMPUTATION_INTENTS = new Set([
  "math",
  "convert_units",
  "convert_currency",
  "time",
  "spelling",
]);

/**
 * Invariant check for answer envelopes.
 * Throws if a non-local intent has an answered verdict with no provenance.
 */
export function assertProvenanceInvariant(env: Partial<AnswerEnvelope>): void {
  const { verdict, intent, provenance } = env;

  // Only check answered verdicts
  if (verdict !== "answered" && verdict !== "answered_hedged") return;
  if (!intent) return;

  // Local intents are exempt
  if (LOCAL_INTENTS.has(intent)) return;

  // Check provenance exists
  if (!provenance || provenance.length === 0) {
    throw new Error(
      `ProvenanceInvariant: verdict="${verdict}" intent="${intent}" but provenance is empty. ` +
        `All non-local answered responses must include at least one provenance entry.`
    );
  }

  // If only local-computation entries, that's only OK for math/unit/time intents
  const hasExternalSource = provenance.some(
    (p) => p.source !== "local-computation" && p.source !== "static-dataset"
  );

  if (!hasExternalSource && !LOCAL_COMPUTATION_INTENTS.has(intent)) {
    throw new Error(
      `ProvenanceInvariant: verdict="${verdict}" intent="${intent}" ` +
        `has only local-computation provenance. An external source is required for this intent.`
    );
  }
}

export type ClarifyOption = {
  label: string;   // pill display text
  query: string;   // full query to send when selected
};

// ---- Block discriminated union ----

export type WikipediaBlock = {
  type: "wikipedia";
  content: string;
  wasTruncated: boolean;
  fullContent?: string;
  title: string;
};

export type WeatherCardBlock = {
  type: "weather-card";
  location: string;
  lat: number;
  lon: number;
  temperatureF: number;
  weatherCode: number;
  description: string;
  windSpeedMph: number;
  timezone: string;
};

export type ComparisonTableBlock = {
  type: "comparison-table";
  entities: string[];        // column headers
  rows: Array<{
    property: string;
    values: string[];
  }>;
};

export type PoemBlock = {
  type: "poem";
  title: string;
  author: string;
  lines: string[];
};

export type SOHit = {
  title: string;
  score: number;
  link: string;
  hasAcceptedAnswer: boolean;
  tags: string[];
};

export type SOResultsBlock = {
  type: "so-results";
  question: string;
  hits: SOHit[];
};

export type MathBlock = {
  type: "math";
  expression: string;
  result: string;
};

export type DefinitionBlock = {
  type: "definition";
  word: string;
  phonetic?: string;
  meanings: Array<{
    partOfSpeech: string;
    definitions: Array<{
      definition: string;
      example?: string;
      synonyms?: string[];
      antonyms?: string[];
    }>;
  }>;
};

export type CurrencyBlock = {
  type: "currency";
  from: string;
  to: string;
  amount: number;
  result: number;
  rate: number;
  date: string;
};

export type UnitBlock = {
  type: "unit";
  value: number;
  fromUnit: string;
  toUnit: string;
  result: number;
};

export type HNBlock = {
  type: "hn";
  results: Array<{
    title: string;
    url: string;
    points: number;
    numComments: number;
    objectID: string;
    createdAt: string;
  }>;
};

export type TimeBlock = {
  type: "time";
  iso: string;
  timezone: string;
  display: string;
};

export type Block =
  | WikipediaBlock
  | WeatherCardBlock
  | ComparisonTableBlock
  | PoemBlock
  | SOResultsBlock
  | MathBlock
  | DefinitionBlock
  | CurrencyBlock
  | UnitBlock
  | HNBlock
  | TimeBlock;

// ---- SSE event payloads ----

export type SSEDelta = {
  event: "delta";
  text: string;
};

export type SSEBlock = {
  event: "block";
  block: Block;
};

export type SSEClarify = {
  event: "clarify";
  question: string;
  options: ClarifyOption[];
};

export type SSEStatus = {
  event: "status";
  text: string;
};

export type SSEProvenance = {
  event: "provenance";
  entries: ProvenanceEntry[];
};

export type SSEDone = {
  event: "done";
  timing?: { totalMs: number };
  trace?: ClassifyTrace;
};

export type SSEError = {
  event: "error";
  message: string;
};

export type SSEEvent =
  | SSEDelta
  | SSEBlock
  | SSEClarify
  | SSEStatus
  | SSEProvenance
  | SSEDone
  | SSEError;

// ---- Classifier trace (dev panel) ----

export type ClassifyTrace = Array<{
  matcher: string;
  result: "claimed" | "passed" | "fallthrough";
}>;

// ---- Chat message ----

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocks?: Block[];
  provenance?: ProvenanceEntry[];
  timing?: { totalMs: number };
  clarify?: { question: string; options: ClarifyOption[] };
  status?: string;
  isStreaming?: boolean;
};

// ---- Conversation ----

export type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
};
