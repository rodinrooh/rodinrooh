import { Block, ClarifyOption, ProvenanceEntry, AnswerEnvelope } from "./envelope"

// Re-export ClarifyOption from envelope for convenience
export type { ClarifyOption, ProvenanceEntry, Block, AnswerEnvelope }

export type SSEEvent =
  | { event: "status"; data: { stage: "classify" | "fetch" | "format"; message: string; source?: string } }
  | { event: "intent"; data: { intent: string; confidence: number; slots: Record<string, string> } }
  | { event: "delta"; data: { text: string } }
  | { event: "block"; data: Block }
  | { event: "clarify"; data: { question: string; options: ClarifyOption[] } }
  | { event: "provenance"; data: { sources: ProvenanceEntry[] } }
  | { event: "done"; data: AnswerEnvelope }
  | { event: "error"; data: { code: string; message: string; retryable: boolean } }

/**
 * Encodes a single SSE event to a string.
 * Format: "event: {name}\ndata: {JSON}\n\n"
 */
export function encodeSSE(ev: SSEEvent): string {
  return `event: ${ev.event}\ndata: ${JSON.stringify(ev.data)}\n\n`
}

/**
 * Creates a ReadableStream that emits SSE-encoded events.
 * Consumes an async generator of SSEEvents.
 */
export function createSSEStream(
  gen: () => AsyncGenerator<SSEEvent>
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of gen()) {
          const encoded = encoder.encode(encodeSSE(event))
          controller.enqueue(encoded)
        }
        controller.close()
      } catch (err) {
        // Emit an error event before closing
        const errorEvent: SSEEvent = {
          event: "error",
          data: {
            code: "STREAM_ERROR",
            message: err instanceof Error ? err.message : "Unknown stream error",
            retryable: false,
          },
        }
        try {
          controller.enqueue(encoder.encode(encodeSSE(errorEvent)))
        } catch {
          // Ignore if we can't write the error
        }
        controller.close()
      }
    },

    cancel() {
      // No cleanup needed for a generator-based stream
    },
  })
}

/**
 * Simple non-cryptographic string hash for seeding deterministic jitter.
 * Based on djb2.
 */
export function hashSeed(s: string): number {
  let hash = 5381
  for (let i = 0; i < s.length; i++) {
    // hash * 33 + char
    hash = ((hash << 5) + hash) ^ s.charCodeAt(i)
    // Keep within 32-bit unsigned int
    hash = hash >>> 0
  }
  return hash
}

/**
 * Computes a deterministic delay using a LCG-style hash.
 * Uses the Knuth multiplicative hash to vary per word position.
 */
function deterministicDelay(
  seed: number,
  wordIndex: number,
  minDelay: number,
  maxDelay: number
): number {
  // Knuth's multiplicative hash constant
  const KNUTH = 2654435761
  const combined = (seed ^ (wordIndex * KNUTH)) >>> 0
  const range = maxDelay - minDelay
  if (range <= 0) return minDelay
  return minDelay + (combined % range)
}

/**
 * Streams markdown text as delta events with word-by-word pacing.
 * Delay is deterministic based on seed derived from the query.
 *
 * @param text - The full text to stream
 * @param seed - Deterministic seed (use hashSeed(query))
 * @param minDelayMs - Minimum delay between words (default: 12ms)
 * @param maxDelayMs - Maximum delay between words (default: 40ms)
 */
export async function* streamText(
  text: string,
  seed: number,
  minDelayMs = 12,
  maxDelayMs = 40
): AsyncGenerator<SSEEvent> {
  // Split text into chunks: words + the whitespace/punctuation that follows each word
  // We preserve the original spacing by splitting on word boundaries
  const chunks = tokenizeForStreaming(text)

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]

    yield {
      event: "delta",
      data: { text: chunk },
    }

    // Delay after each chunk, deterministically jittered
    const delay = deterministicDelay(seed, i, minDelayMs, maxDelayMs)
    await sleep(delay)
  }
}

/**
 * Splits text into streamable tokens.
 * Groups: word + trailing whitespace, preserving structure.
 */
function tokenizeForStreaming(text: string): string[] {
  const chunks: string[] = []
  // Match word characters (possibly with punctuation) followed by optional whitespace
  const re = /\S+\s*/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    chunks.push(match[0])
  }
  return chunks
}

/**
 * Promise-based sleep helper.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
