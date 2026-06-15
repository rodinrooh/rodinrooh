/**
 * notgpt-v2 API — clean prototype.
 *
 * Architecture:
 *   1. Classify (social / math / factual)
 *   2. For factual: gather Wikipedia candidates (DDG + search) → embed → rank passages
 *   3. Stream response as SSE
 *
 * No word lists. No lookup tables. Sentence embeddings bridge vocabulary gaps.
 */

export const runtime = "nodejs"

import { classify } from "../../engine/classify"
import { retrieveBestPassage } from "../../engine/retrieve"
import { evaluate, format } from "mathjs"

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function streamText(text: string): ReadableStream {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      // Emit the text in small chunks to simulate streaming
      const words = text.split(/(\s+)/)
      let i = 0
      const emit = () => {
        if (i >= words.length) {
          controller.enqueue(encoder.encode(sse("done", { ok: true })))
          controller.close()
          return
        }
        const chunk = words.slice(i, i + 3).join("")
        if (chunk.trim()) {
          controller.enqueue(encoder.encode(sse("delta", { text: chunk })))
        }
        i += 3
        // Small delay gives the client time to render
        setTimeout(emit, 0)
      }
      emit()
    },
  })
}

async function handleFactual(query: string): Promise<ReadableStream> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(sse("status", { message: "Searching..." })))

      const result = await retrieveBestPassage(query)

      if (!result) {
        controller.enqueue(encoder.encode(sse("delta", { text: "Nothing found — I searched Wikipedia and couldn't find a relevant passage." })))
        controller.enqueue(encoder.encode(sse("done", { ok: false })))
        controller.close()
        return
      }

      // Stream passage text word by word
      const words = result.passage.split(/(\s+)/)
      for (let i = 0; i < words.length; i += 2) {
        const chunk = words.slice(i, i + 2).join("")
        if (chunk) controller.enqueue(encoder.encode(sse("delta", { text: chunk })))
      }

      controller.enqueue(encoder.encode(sse("provenance", {
        sources: [{
          source: "wikipedia",
          url: result.articleUrl,
          label: result.articleTitle,
          score: Math.round(result.score * 100) / 100,
        }]
      })))
      controller.enqueue(encoder.encode(sse("done", { ok: true })))
      controller.close()
    },
  })
}

function handleMath(query: string): ReadableStream {
  try {
    const expr = query.replace(/[^0-9+\-*/^().%\s]/g, "").trim()
    const result = evaluate(expr)
    const formatted = format(result, { precision: 14 })
    return streamText(`**${formatted}**`)
  } catch {
    return streamText("Couldn't parse that as a math expression.")
  }
}

function handleSocial(): ReadableStream {
  return streamText("Hey. Ask me anything — I'll find the Wikipedia passage that answers it.")
}

export async function POST(req: Request) {
  const { message } = await req.json()
  if (!message?.trim()) {
    return new Response("No message", { status: 400 })
  }

  const intent = classify(message.trim())

  let stream: ReadableStream
  if (intent === "math") stream = handleMath(message)
  else if (intent === "social") stream = handleSocial()
  else stream = await handleFactual(message)

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  })
}
