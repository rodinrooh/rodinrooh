export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { classify } from "../../engine/classify/index";
import { runPipeline } from "../../engine/pipeline";
import { encodeSSE, SSEEvent } from "../../engine/sse";
import { createSessionMemory } from "../../engine/persona/engine";
import { SessionMemory } from "../../engine/persona/bits";
import { TurnContext, EntityRef } from "../../engine/classify/coref";
import { TEMPORAL_TERMS } from "../../engine/classify/lexicons";
import { searchWiki } from "../../engine/sources/wikipedia";

/**
 * Spell-correct the query BEFORE intent classification.
 * Uses Wikipedia's search suggestion for phrase-level correction ("tiem in tokyo" → "time in tokyo"),
 * and falls back to Datamuse word-by-word correction for individual typos ("balck" → "black").
 *
 * Critical: classification must see corrected input or intent detection fails
 * ("tiem" never matches the time pattern; "balck" finds German generals).
 */
async function getSpellingCorrection(q: string): Promise<string | null> {
  const words = q.trim().split(/\s+/)
  if (words.length === 0) return null

  try {
    // Strategy 1 (first): Transposition correction — handles single adjacent-swap typos.
    // Run FIRST so that "balck" → "black" is handled before Wikipedia can suggest "balch home".

    // Strategy 2: Transposition correction — no external API needed.
    // Handles "balck" → "black" (adjacent letter swap) using a compact common-word list.
    // Datamuse's ?sp= treats "balck" as a valid word (score 145039), so it's useless here.
    const COMMON_WORDS = new Set([
      // Tech/modern words that Wikipedia might "correct" to unrelated words
      "wifi","gps","cpu","gpu","dna","rna","atp","nfl","nba","nfl","url","app","pdf","ai",
      "ml","tv","dvd","usb","atm","mpg","mph","kph","fps","hd","uhd","vr","ar","iot","api",
      // Common words Wikipedia might "correct" to unrelated titles/names
      "karma","yoga","anime","manga","sushi","pizza","taco","dude","sick","even","night",
      "gravity","motion","force","mass","void","soul","mind","dark","heat","sound","wave",
      "capital","capitals","tides","tide","steel","strong","affect","effect","does","done",
      "moon","tidal","alloy","brain","nerve","organ","cause","causes","effects","facts",
      "confused","confuse","memory","sleep","drunk","alcohol","cancer","tumor","malaria",
      "blood","clot","dark","cell","bone","skin","nerve","muscle","organ","limb","gland",
      "difference","differences","similar","similarity","climate","weather","temperature",
      "steel","metal","wood","glass","paper","plastic","concrete","rubber","fabric","cloth",
      // Core concept words that Wikipedia suggestions corrupt to unrelated words
      // "life"→"time", "inflation"→"flation", "love"→"live", etc.
      "life","death","love","hate","fear","hope","faith","truth","meaning","purpose","soul",
      "mind","body","heart","brain","blood","bone","skin","eyes","ears","nose","mouth","hands",
      "inflation","deflation","recession","depression","capitalism","socialism","democracy",
      "gravity","velocity","momentum","frequency","amplitude","entropy","evolution","mutation",
      "religion","spirituality","consciousness","unconscious","subconscious","meditation",
      "philosophy","psychology","sociology","anthropology","archaeology","astronomy",
      // Common English words that spell correction mis-corrects (usually plurals → singulars)
      "birds","humans","animals","plants","insects","mammals","reptiles","bacteria","viruses",
      "trees","leaves","flowers","roots","stems","cells","atoms","molecules","proteins",
      "rivers","oceans","mountains","forests","deserts","glaciers","volcanoes","earthquakes",
      "cannot","wont","dont","doesnt","arent","isnt","wasnt","shouldnt","wouldnt","couldnt",
      // Number words and quantity words that spell correction may alter
      "one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve",
      "hundred","thousand","million","billion","trillion","percent","percentage",
      // Taste/sensory adjectives — commonly spell-corrected to unrelated words
      "salty","sweet","sour","bitter","spicy","acidic","alkaline","toxic","edible",
      "alive","dead","awake","asleep","tired","exhausted","hungry","thirsty","bored",
      // Company names — must not be spell-corrected ("sony"→"song", "uber"→"user", etc.)
      "google","apple","amazon","microsoft","netflix","spotify","uber","tesla","facebook",
      "twitter","samsung","nike","paypal","airbnb","lyft","openai","youtube","instagram",
      "whatsapp","snapchat","pinterest","linkedin","reddit","tiktok","walmart","disney",
      "sony","honda","toyota","bmw","ford","nvidia","intel","amd","qualcomm","broadcom",
      "meta","alphabet","shopify","stripe","palantir","databricks","figma","notion","slack",
      // Famous people names that spell correction corrupts to other surnames
      "einstein","newton","darwin","galileo","shakespeare","beethoven","mozart","edison",
      "aristotle","socrates","plato","napoleon","cleopatra","columbus","alexander","caesar",
      "quasar","quasars","pulsar","nebula","supernova","neutrino","proton","neutron","electron",
      "photon","lepton","boson","quark","fermion","baryon","hadron","meson","gluon",
      "detox","purge","cleanse","yawn","snore","sneeze","hiccup","burp","sweat",
      "rust","rusts","rusting","float","floats","floating","sink","sinks","sinking",
      "burn","burns","burning","melt","melts","boil","boils","freeze","freezes",
      "reef","barrier","northern","lights","aurora","borealis","polaris","equinox","solstice",
      "liver","kidney","spleen","pancreas","gallbladder","thyroid","adrenal","pituitary",
      "mitosis","meiosis","osmosis","diffusion","respiration","transpiration","fermentation",
      "entropy","momentum","torque","velocity","acceleration","inertia","friction","buoyancy",
      // Scientific/technical words spell correction commonly corrupts
      "lightning","thunder","recognize","recognizes","recognized","recognition",
      "neurons","neuron","molecule","molecules","chromosome","chromosomes","protein","proteins",
      "antibody","antibodies","antigen","antigens","enzyme","enzymes","hormone","hormones",
      "bacteria","virus","viruses","vaccine","vaccines","immune","immunity","organism",
      // Geography/history words that get corrupted to unrelated proper nouns
      "mayans","mayan","aztecs","aztec","incas","inca","vikings","viking","mongols","mongol",
      "pharaoh","pharaohs","pyramid","pyramids","colosseum","parthenon","pantheon",
      // Common words that spell correction corrupts
      "mars","moon","sun","earth","saturn","venus","jupiter","neptune","uranus",
      "coffee","sugar","salt","bread","water","milk","rice","meat","fish","fruit","grain",
      "deep","ocean","sea","lake","river","mountain","desert","forest","island","valley",
      // Words that Wikipedia phrase suggestion changes in unhelpful ways
      "different","difference","similar","similar","various","several","multiple",
      "human","humans","animal","animals","plant","plants","species","organism","organisms",
      // Core English
      "will","can","but","how","who","when","where","why","which","all","been","were","got",
      // Commonly mistyped factual words
      "black","white","blue","dark","light","time","work","make","word","year","line","side",
      "form","hole","star","moon","earth","space","water","fire","bone","heart","mind","body",
      "food","color","shape","size","atom","gene","cell","acid","mass","heat","sound","wave",
      "force","power","energy","ocean","river","leaf","tree","fish","bird","virus","blood",
      "brain","nerve","skin","muscle","plant","human","animal","science","theory","history",
      "nature","system","number","level","state","place","point","world","right","small","large",
      "short","long","high","deep","free","full","open","real","true","clear","close","early",
      "late","slow","fast","hard","soft","warm","cold","hot","bright","heavy","light",
      "gold","iron","salt","iron","carbon","oxygen","nitrogen","hydrogen","silver","copper",
    ])

    const stopWords = new Set(["a","an","the","is","are","was","were","of","in","on","at",
      "to","do","does","and","or","what","who","how","why","when","where","which","i","my"])

    function swapVariants(word: string): string[] {
      const letters = word.split("")
      return letters.slice(0, -1).map((_, i) => {
        const s = [...letters];
        [s[i], s[i + 1]] = [s[i + 1], s[i]]
        return s.join("")
      })
    }

    // Strategy 1: Two-pass word-level correction (runs together, not early-exit per pass).
    // Pass A: Transposition — "captial"→"capital", "strnog"→"strong" (in-memory, no API)
    // Pass B: Single-word Wikipedia suggestion for non-transposable typos: "stell"→"steel", "afect"→"affect"
    // Both passes run; fixes are combined. Early return only after BOTH passes.
    const transpFixes: { word: string; fix: string }[] = []
    for (const word of words) {
      const clean = word.toLowerCase().replace(/[^a-z]/g, "")
      if (clean.length <= 3 || stopWords.has(clean) || COMMON_WORDS.has(clean)) continue
      const transpFix = swapVariants(clean).find(v => COMMON_WORDS.has(v))
      if (transpFix) transpFixes.push({ word, fix: transpFix })
    }

    // After collecting transposition fixes, find words still needing correction
    const alreadyFixedWords = new Set(transpFixes.map(f => f.word.toLowerCase()))
    const suspectWords = words.filter(w => {
      const clean = w.toLowerCase().replace(/[^a-z]/g, "")
      if (clean.length <= 4 || stopWords.has(clean) || COMMON_WORDS.has(clean)) return false
      if (alreadyFixedWords.has(clean)) return false  // already fixed by transposition
      return /[bcdfghjklmnpqrstvwxyz]{4,}/.test(clean) ||
        /phto|lck|shs|blck|lcak|afec|strn|stell/.test(clean)
    })

    const wikiWordFixes: { word: string; fix: string }[] = []
    if (suspectWords.length > 0) {
      const corrections = await Promise.all(suspectWords.map(async (word) => {
        const clean = word.toLowerCase().replace(/[^a-z]/g, "")
        try {
          const r = await searchWiki(clean, 1)
          const sug = r?.suggestion
          if (sug && !sug.includes(" ") && sug.toLowerCase() !== clean && sug.length <= clean.length + 3) {
            return { word, fix: sug }
          }
        } catch { /* ignore */ }
        return null
      }))
      wikiWordFixes.push(...corrections.filter(Boolean) as { word: string; fix: string }[])
    }

    const allWordFixes = [...transpFixes, ...wikiWordFixes]
    if (allWordFixes.length > 0) {
      let correctedQuery = q
      for (const c of allWordFixes) {
        correctedQuery = correctedQuery.replace(
          new RegExp(`\\b${c.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"),
          c.fix
        )
      }
      // After word-level fixes, try Wikipedia phrase suggestion on corrected query
      // "how dos the moon affect tides" → "how does the moon affect tides"
      try {
        const r2 = await searchWiki(correctedQuery, 1)
        const sug2 = r2?.suggestion
        if (sug2 && sug2.toLowerCase() !== correctedQuery.toLowerCase()) {
          const origW2 = correctedQuery.toLowerCase().split(/\s+/)
          const sugW2 = sug2.split(/\s+/)
          let changedToProperNoun2 = false, anyChangedWordWasValid2 = false, cnt2 = 0
          for (let i = 0; i < Math.min(origW2.length, sugW2.length); i++) {
            if (origW2[i] !== sugW2[i].toLowerCase()) {
              cnt2++
              if (/^[A-Z]/.test(sugW2[i])) changedToProperNoun2 = true
              if (COMMON_WORDS.has(origW2[i])) anyChangedWordWasValid2 = true
            }
          }
          if (cnt2 <= 2 && !changedToProperNoun2 && !anyChangedWordWasValid2) return sug2
        }
      } catch { /* ignore */ }
      return correctedQuery
    }

    // Strategy 2 (fallback): Wikipedia phrase-level suggestion.
    // Good for multi-word corrections ("french revoluion" → "French Revolution"),
    // but unreliable for single-word typos where it suggests unrelated proper nouns.
    const wikiResult = await searchWiki(q, 1)
    const wikiSuggestion = wikiResult?.suggestion
    if (wikiSuggestion && wikiSuggestion.toLowerCase() !== q.toLowerCase()) {
      const origWords = q.toLowerCase().split(/\s+/)
      const sugParts = wikiSuggestion.split(/\s+/)
      let anyChange = false
      let changedToProperNoun = false
      let anyChangedWordWasValid = false
      for (let i = 0; i < Math.min(origWords.length, sugParts.length); i++) {
        if (origWords[i] !== sugParts[i].toLowerCase()) {
          anyChange = true
          if (/^[A-Z]/.test(sugParts[i])) changedToProperNoun = true
          // If the original word is already in COMMON_WORDS, it's a valid word — don't "correct" it
          // ("gravity" → "gavity" is wrong; "dude" → "duke" is wrong)
          if (COMMON_WORDS.has(origWords[i])) anyChangedWordWasValid = true
        }
      }
      // Count how many words changed — if many change, the suggestion might be unreliable
      const changedCount = origWords.filter((w, i) => sugParts[i] && w !== sugParts[i].toLowerCase()).length
      // Only accept if: ≤ 2 words changed, none are proper nouns, and no already-valid word was changed
      if (anyChange && changedCount <= 2 && !changedToProperNoun && !anyChangedWordWasValid) return wikiSuggestion
    }

    return null
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
