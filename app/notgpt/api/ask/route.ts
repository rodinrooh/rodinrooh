export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { classify } from "../../engine/classify/index";
import { runPipeline } from "../../engine/pipeline";
import { encodeSSE, SSEEvent } from "../../engine/sse";
import { createSessionMemory } from "../../engine/persona/engine";
import { SessionMemory } from "../../engine/persona/bits";
import { TurnContext } from "../../engine/classify/coref";
import { TEMPORAL_TERMS } from "../../engine/classify/lexicons";

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

  // Classify the message
  const classified = classify(message, context);
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

        // Run the pipeline
        for await (const event of runPipeline(
          message,
          classified,
          context,
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
