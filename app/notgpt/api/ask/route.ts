/**
 * notgpt API — v2 semantic passage retrieval.
 *
 * Old pipeline (route.legacy.ts) is kept but not in use.
 * This route uses all-MiniLM-L6-v2 for passage ranking — no word lists.
 */

export const runtime = "nodejs"
export const maxDuration = 60
export const dynamic = "force-dynamic"

import { classify } from "../../../notgpt-v2/engine/classify"
import { retrieveBestPassage } from "../../../notgpt-v2/engine/retrieve"
import { normalizeQuery } from "../../../notgpt-v2/engine/normalize"
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { evaluate, format } = require("mathjs")

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

async function handleFactual(query: string, lastArticle?: string): Promise<ReadableStream> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(sse("status", { stage: "fetch", message: "Searching Wikipedia...", source: "wikipedia" })))

      const normalizedQuery = normalizeQuery(query, lastArticle ? { article: lastArticle } : undefined)
      const result = await retrieveBestPassage(normalizedQuery, lastArticle ? { article: lastArticle } : undefined)

      if (!result) {
        const msg = "Nothing found — I searched Wikipedia from multiple angles and couldn't find a passage that answers this."
        for (const word of msg.split(" ")) {
          controller.enqueue(encoder.encode(sse("delta", { text: word + " " })))
        }
        controller.enqueue(encoder.encode(sse("done", { id: crypto.randomUUID(), verdict: "declined", intent: "lookup", provenance: [], timing: { totalMs: 0 } })))
        controller.close()
        return
      }

      // Stream passage word by word
      const words = result.passage.split(" ")
      for (const word of words) {
        controller.enqueue(encoder.encode(sse("delta", { text: word + " " })))
      }

      controller.enqueue(encoder.encode(sse("provenance", {
        sources: [{
          source: "wikipedia",
          url: result.articleUrl,
          label: result.articleTitle,
          fetchedAt: new Date().toISOString(),
        }]
      })))
      controller.enqueue(encoder.encode(sse("done", {
        id: crypto.randomUUID(),
        verdict: "answered",
        intent: "lookup",
        provenance: [{ source: "wikipedia", url: result.articleUrl, label: result.articleTitle, fetchedAt: new Date().toISOString() }],
        timing: { totalMs: 0 },
      })))
      controller.close()
    },
  })
}

function handleMath(query: string): ReadableStream {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      try {
        const expr = query.replace(/[^0-9+\-*/^().%\s]/g, "").trim()
        const result = evaluate(expr)
        const formatted = format(result, { precision: 14 })
        const text = `**${formatted}**`
        controller.enqueue(encoder.encode(sse("delta", { text })))
        controller.enqueue(encoder.encode(sse("done", { id: crypto.randomUUID(), verdict: "answered", intent: "math", provenance: [], timing: { totalMs: 0 } })))
      } catch {
        controller.enqueue(encoder.encode(sse("delta", { text: "Couldn't parse that as a math expression." })))
        controller.enqueue(encoder.encode(sse("done", { id: crypto.randomUUID(), verdict: "declined", intent: "math", provenance: [], timing: { totalMs: 0 } })))
      }
      controller.close()
    },
  })
}

function handleSocial(): ReadableStream {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(sse("delta", { text: "Hey. Ask me anything — I'll find the Wikipedia passage that answers it." })))
      controller.enqueue(encoder.encode(sse("done", { id: crypto.randomUUID(), verdict: "answered", intent: "greeting", provenance: [], timing: { totalMs: 0 } })))
      controller.close()
    },
  })
}

export async function POST(req: Request) {
  const body = await req.json()
  const message: string = (body.message ?? "").trim()
  if (!message) return new Response("No message", { status: 400 })

  // Extract last retrieved article from chat history for coreference resolution
  // Chat.tsx sends context as [{role, content, entities: [articleTitle, ...]}]
  const contextMessages: Array<{ role: string; entities?: string[] }> = body.context ?? []
  const lastBotWithArticle = [...contextMessages].reverse().find(m => m.role !== "user" && m.entities?.[0])
  const lastArticle = lastBotWithArticle?.entities?.[0]

  // Normalize BEFORE classifying so "alr great" → "great" before isSocial sees it.
  // This also means classify operates on the clean query, not raw slang/filler.
  const classifyContext = lastArticle ? { article: lastArticle } : undefined
  const queryForClassify = normalizeQuery(message, classifyContext)
  const intent = classify(queryForClassify, classifyContext)

  let stream: ReadableStream
  if (intent === "math") stream = handleMath(message)
  else if (intent === "social") stream = handleSocial()
  else stream = await handleFactual(message, lastArticle)

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  })
}
