export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { classify } from "../../engine/classify/index";
import { runPipeline } from "../../engine/pipeline";
import { encodeSSE, SSEEvent } from "../../engine/sse";
import { createSessionMemory } from "../../engine/persona/engine";
import { SessionMemory } from "../../engine/persona/bits";
import { TurnContext, EntityRef } from "../../engine/classify/coref";
import { TEMPORAL_TERMS } from "../../engine/classify/lexicons";
import { fetchWikiSummary } from "../../engine/sources/wikipedia";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nspellCreate = require("nspell") as (
  aff: Buffer, dic: Buffer
) => { correct: (w: string) => boolean; suggest: (w: string) => string[]; add: (w: string) => void }

// Lazily initialized — dictionary files are ~1.5MB each; defer until first request
let _spell: ReturnType<typeof nspellCreate> | null = null

function getSpell() {
  if (_spell) return _spell
  const root = join(process.cwd(), "node_modules", "dictionary-en")
  const aff = readFileSync(join(root, "index.aff"))
  const dic = readFileSync(join(root, "index.dic"))
  _spell = nspellCreate(aff, dic)
  // Supplement with modern/tech words not in standard English dictionary
  const extra = [
    "wifi","dna","rna","cpu","gpu","gps","api","ai","ml","url","dvd","usb","atm",
    "app","apps","pdf","ai","nfl","nba","html","css","sql","vr","ar","iot","ar",
    "podcast","podcasts","emoji","emojis","selfie","selfies","hashtag","hashtags",
    "bitcoin","crypto","blockchain","cryptocurrency","ethereum","nft","defi",
    "smartphone","smartphones","chatgpt","openai","elon","musk","iphone","android",
    "youtube","google","amazon","twitter","tesla","netflix","spotify","uber","airbnb",
    "reddit","snapchat","whatsapp","instagram","tiktok","facebook","microsoft","nvidia",
    "samsung","paypal","lyft","pinterest","linkedin","walmart","disney","sony",
    "honda","toyota","bmw","ford","intel","amd","qualcomm","shopify","stripe",
    "figma","notion","slack","meta","alphabet","palantir","databricks","broadcom",
  ]
  for (const w of extra) _spell.add(w)
  return _spell
}

// Slang/internet words that should NEVER be spell-corrected — they will be stripped by
// normalize.ts anyway. Without this, "bruh" → "brush", "lol" → "loll", etc.
const SPELL_SLANG = new Set([
  "bruh","bro","dude","yo","lol","lmao","omg","wtf","tf","af","rn","ngl","tbh",
  "imo","smh","idk","idek","tho","tbt","btw","fyi","fr","lowkey","highkey","deadass",
  "literally","honestly","actually","basically","genuinely","fr","ok","okay",
  "lol","rofl","lmfao","omfg","ffs","smh","ngl","tbf","imo","imho","fwiw",
  "bruh","bruv","fam","sis","bae","slay","cap","nocap","npc","sheesh","bussin",
  "cheugy","yeet","yolo","swag","drip","mid","sus","vibe","vibes","based","cringe",
])

// Stop words: never attempt spell correction on these
const SPELL_STOP = new Set([
  "the","a","an","is","are","was","were","be","been","being","have","has","had",
  "do","does","did","will","would","could","should","may","might","shall","can",
  "of","in","on","at","to","for","with","by","from","up","and","or","but","not",
  "i","me","we","you","he","she","they","my","your","his","her","our","their",
  "what","which","who","whom","whose","when","where","why","how","if","so","as",
  "this","that","these","those","it","its","get","got","go","went","come","came",
])

function swapAdjacent(word: string): string[] {
  const letters = word.split("")
  return letters.slice(0, -1).map((_, i) => {
    const s = [...letters];
    [s[i], s[i + 1]] = [s[i + 1], s[i]]
    return s.join("")
  })
}

/**
 * Spell-correct the query BEFORE intent classification, using nspell + dictionary-en.
 *
 * Key improvements over the old Wikipedia-API approach:
 * - "bones" → valid English word → no corruption → no more "boneh break"
 * - "blush" → valid → no more "blues"
 * - "compas" → suggests "compass" (real word, not Wikipedia article title)
 * - "stra" → transposition check finds "star" before nspell can suggest "strap"
 *
 * Only corrects words that are definitively not in the English dictionary.
 */
async function getSpellingCorrection(q: string): Promise<string | null> {
  const words = q.trim().split(/\s+/)
  if (words.length === 0) return null

  try {
    const spell = getSpell()
    let anyChange = false

    const correctedWords = await Promise.all(words.map(async rawWord => {
      const clean = rawWord.toLowerCase().replace(/[^a-z]/g, "")
      // Skip: very short, stop/slang word, or already valid English
      if (clean.length < 4 || SPELL_STOP.has(clean) || SPELL_SLANG.has(clean)) return rawWord
      if (spell.correct(clean)) return rawWord  // valid English word → never touch it

      // KEY: Try the literal word as a Wikipedia title BEFORE applying any correction.
      // "banksy" → nspell says invalid, but Wikipedia has "Banksy" article → don't touch it.
      // "floyd" → has a disambiguation page → don't "correct" to "flood".
      // This handles ALL proper nouns/brands/pseudonyms without needing to enumerate them.
      // Only runs for words nspell can't identify (so it doesn't slow down normal queries).
      try {
        const wikiCheck = await fetchWikiSummary(clean)
        if (wikiCheck?.extract) {
          return rawWord  // Wikipedia knows this word (including as disambiguation) → never correct it
        }
      } catch { /* ignore timeout/network errors — fall through to nspell */ }

      // Check adjacent-swap transpositions (edit distance 1 via Damerau)
      // "stra" → swaps → "star" is valid English → return "star" before nspell says "strap"
      const swaps = swapAdjacent(clean)
      const validSwap = swaps.find(s => spell.correct(s))
      if (validSwap) {
        anyChange = true
        return rawWord.replace(clean, validSwap)
      }

      // Fall back to nspell suggestions (covers edit distance 1-2)
      const allowProperNoun = clean.length >= 6
      const suggestions = spell.suggest(clean).filter(s =>
        !s.includes(" ") &&
        (allowProperNoun || !/^[A-Z]/.test(s)) &&
        Math.abs(s.length - clean.length) <= 2
      )
      if (!suggestions.length) return rawWord

      anyChange = true
      return rawWord.replace(clean, suggestions[0].toLowerCase())
    }))

    return anyChange ? correctedWords.join(" ") : null
  } catch {
    return null
  }
}


type RequestBody = {
  message: string;
  context?: TurnContext[];
  sessionMemory?: SessionMemory;
};

function detectRecency(raw: string): boolean {
  const lower = raw.toLowerCase();
  return TEMPORAL_TERMS.some((term) => lower.includes(term));
}

/**
 * Deserialize SessionMemory from a plain object (Maps are JSON-serialized as empty objects).
 * We reconstruct the Maps from the serialized form.
 */
function deserializeMemory(raw: unknown): SessionMemory {
  if (!raw || typeof raw !== "object") {
    return createSessionMemory();
  }
  const obj = raw as Record<string, unknown>;

  // Re-hydrate Maps from serialized form
  const usedVariantIds = new Map<string, Set<number>>();
  const rawUsed = obj.usedVariantIds;
  if (rawUsed && typeof rawUsed === "object") {
    for (const [k, v] of Object.entries(rawUsed as Record<string, number[]>)) {
      usedVariantIds.set(k, new Set(Array.isArray(v) ? v : []));
    }
  }

  const bitLastUsedAt = new Map<string, number>();
  const rawBits = obj.bitLastUsedAt;
  if (rawBits && typeof rawBits === "object") {
    for (const [k, v] of Object.entries(rawBits as Record<string, number>)) {
      bitLastUsedAt.set(k, typeof v === "number" ? v : 0);
    }
  }

  const categoryCounts = new Map<string, number>();
  const rawCounts = obj.categoryCounts;
  if (rawCounts && typeof rawCounts === "object") {
    for (const [k, v] of Object.entries(rawCounts as Record<string, number>)) {
      categoryCounts.set(k, typeof v === "number" ? v : 0);
    }
  }

  return {
    usedVariantIds,
    bitLastUsedAt: bitLastUsedAt as Map<import("../../engine/persona/bits").BitId, number>,
    failureStreak: typeof obj.failureStreak === "number" ? obj.failureStreak : 0,
    lastQueryHash: typeof obj.lastQueryHash === "string" ? obj.lastQueryHash : null,
    messageIndex: typeof obj.messageIndex === "number" ? obj.messageIndex : 0,
    categoryCounts,
  };
}

export async function POST(req: NextRequest): Promise<Response> {
  // Parse request body
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(
      encodeSSE({
        event: "error",
        data: { code: "PARSE_ERROR", message: "Invalid JSON body", retryable: false },
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-store",
          "Connection": "keep-alive",
        },
      }
    );
  }

  const { message, context = [], sessionMemory: rawMemory } = body;

  if (!message || typeof message !== "string" || !message.trim()) {
    return new Response(
      encodeSSE({
        event: "error",
        data: { code: "EMPTY_MESSAGE", message: "Message is required", retryable: false },
      }),
      {
        status: 400,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-store",
          "Connection": "keep-alive",
        },
      }
    );
  }

  // Spell correction: run BEFORE intent classification.
  // "tiem in tokyo" → suggest "time in tokyo" → time intent fires correctly.
  // "balck hole" → "black hole" → correct lookup.
  // Run in parallel with memory deserialization to minimize latency.
  const normalizedContext = (context ?? []).map((turn) => ({
    ...turn,
    entities: (turn.entities ?? []).map((e: unknown) => {
      if (typeof e === "string") return { title: e, kind: "thing" as const };
      const obj = e as Record<string, unknown>;
      return {
        title: String(obj.title || obj.label || ""),
        kind: ((obj.kind as EntityRef["kind"]) || "thing"),
        gender: obj.gender as EntityRef["gender"],
        qid: obj.qid as string | undefined,
      } satisfies EntityRef;
    }),
  })) as TurnContext[];

  const [corrected] = await Promise.all([
    getSpellingCorrection(message),
  ]);
  const messageToClassify = corrected || message;

  const classified = classify(messageToClassify, normalizedContext);
  const isRecentQuery = detectRecency(message);

  // Deserialize or create session memory
  const memory = deserializeMemory(rawMemory);

  // Build the SSE stream
  const encoder = new TextEncoder();
  const abortController = new AbortController();

  // Track if client disconnected
  req.signal.addEventListener("abort", () => {
    abortController.abort();
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Keepalive ping every 15 seconds
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          clearInterval(pingInterval);
        }
      }, 15_000);

      const cleanup = () => clearInterval(pingInterval);

      try {
        // Emit the intent event immediately so the client can show intent in UI
        const intentEvent: SSEEvent = {
          event: "intent",
          data: {
            intent: classified.intent,
            confidence: classified.confidence,
            slots: classified.slots,
          },
        };
        controller.enqueue(encoder.encode(encodeSSE(intentEvent)));

        // Run the pipeline — use corrected spelling if available
        for await (const event of runPipeline(
          messageToClassify,
          classified,
          normalizedContext,
          memory,
          isRecentQuery
        )) {
          // Stop if client disconnected
          if (req.signal.aborted || abortController.signal.aborted) {
            break;
          }

          const encoded = encodeSSE(event);
          controller.enqueue(encoder.encode(encoded));

          // On "done", close the stream
          if (event.event === "done") {
            break;
          }
        }
      } catch (err) {
        // Emit error event
        const errorEvent: SSEEvent = {
          event: "error",
          data: {
            code: "PIPELINE_ERROR",
            message: err instanceof Error ? err.message : "An unexpected error occurred",
            retryable: true,
          },
        };
        try {
          controller.enqueue(encoder.encode(encodeSSE(errorEvent)));
        } catch {
          // Ignore write errors after disconnect
        }
      } finally {
        cleanup();
        try {
          controller.close();
        } catch {
          // Ignore close errors
        }
      }
    },

    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering for SSE
    },
  });
}
