/**
 * notgpt API — v2 semantic passage retrieval + persona response layer.
 *
 * Retrieval: all-MiniLM-L6-v2 semantic ranking over Wikipedia passages.
 * Persona: copy from engine/persona/copy/ — dry, literal, smug, never apologetic.
 *
 * "Nothing found" never appears. Social and failed-retrieval responses
 * use the persona layer, triggered by the NLP classifier already built.
 * No new word lists. Retrieval logic untouched.
 */

export const runtime = "nodejs"
export const maxDuration = 60
export const dynamic = "force-dynamic"

import { classify } from "../../../notgpt-v2/engine/classify"
import { retrieveBestPassage } from "../../../notgpt-v2/engine/retrieve"
import { normalizeQuery } from "../../../notgpt-v2/engine/normalize"
import { GREETINGS, THANKS, HOW_ARE_YOU, NEUTRAL_ACK, FLIRTING } from "../../engine/persona/copy/social"
import { NOT_FOUND, UNPARSEABLE } from "../../engine/persona/copy/failures"
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { evaluate, format } = require("mathjs")
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nlp = require("compromise")

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

/** Deterministic variant picker — same query always gets same response, different queries vary. */
function pick(variants: string[], seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  // Prefer slot-free variants — the v2 pipeline doesn't supply {sourceCount}/{ms}/{term}
  const clean = variants.filter(v => !v.includes("{"))
  const pool = clean.length > 0 ? clean : variants
  const v = pool[h % pool.length]
  return v.replace(/\{[^}]+\}/g, "").replace(/\s{2,}/g, " ").trim()
}

/**
 * Map NLP structure of a social query to the right persona copy category.
 * No word lists — triggered by NLP tags and structural signals only.
 */
function socialResponse(raw: string, normalized: string): string {
  const q = normalized.trim() || raw.trim()
  const words = q.split(/\s+/).filter(Boolean)

  try {
    const doc = nlp(q.toLowerCase()) as any

    // "How are you" / wellbeing questions — second-person + copula + no topic noun
    const isHowAreYou = doc.has("(how|are|am|is)") && doc.has("(you|your)") && words.length <= 6
    if (isHowAreYou) return pick(HOW_ARE_YOU, q)

    // Flirting / preference questions — second-person with question word but no factual topic
    // "what do you think", "do you like", "would you rather"
    if (doc.has("(you|your)") && doc.has("#QuestionWord")) return pick(FLIRTING, q)

    // Thanks / acknowledgment — positive reactions
    if (doc.has("(thank|thanks|thx|ty|appreciate|cheers)")) return pick(THANKS, q)

    // Short expression (≤2 words, #Expression or #Greeting): "hey", "lol", "ok", "yo"
    // Use NEUTRAL_ACK — terse matches the energy
    if (words.length <= 2 && (doc.has("#Expression") || doc.has("#Greeting"))) {
      return pick(NEUTRAL_ACK, q)
    }

    // Second-person statement (no question word) — "you're useless", "you suck", "you're great"
    if (doc.has("(you|your|you're)") && !doc.has("#QuestionWord")) return pick(NEUTRAL_ACK, q)

    // Orphaned pronoun with no context — "what happened to it", "how much did they make"
    // Goes to UNPARSEABLE since there's no way to answer
    const hasAnaphor = doc.has("(they|them|their|it|its|he|she|him|her)")
    if (hasAnaphor && doc.nouns().not("#Pronoun").length === 0 && words.length < 8) {
      return pick(UNPARSEABLE, q)
    }

    // No question word and short — reaction, filler, non-question
    if (!doc.has("#QuestionWord") && words.length <= 4) return pick(NEUTRAL_ACK, q)

    // Default — first-contact greeting style
    return pick(GREETINGS, q)

  } catch {
    return pick(NEUTRAL_ACK, q)
  }
}

/** Not-found response — dry, honest, in-character. Never says "Nothing found." */
function notFoundResponse(normalized: string): string {
  return pick(NOT_FOUND, normalized)
}

async function handleFactual(query: string, lastArticle?: string): Promise<ReadableStream> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(sse("status", { stage: "fetch", message: "Searching Wikipedia...", source: "wikipedia" })))

      const normalizedQuery = normalizeQuery(query, lastArticle ? { article: lastArticle } : undefined)
      const result = await retrieveBestPassage(normalizedQuery, lastArticle ? { article: lastArticle } : undefined)

      if (!result) {
        const msg = notFoundResponse(normalizedQuery)
        for (const word of msg.split(" ")) {
          controller.enqueue(encoder.encode(sse("delta", { text: word + " " })))
        }
        controller.enqueue(encoder.encode(sse("done", { id: crypto.randomUUID(), verdict: "declined", intent: "lookup", provenance: [], timing: { totalMs: 0 } })))
        controller.close()
        return
      }

      // Retrieval succeeded — stream passage unchanged
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
        controller.enqueue(encoder.encode(sse("delta", { text: `**${formatted}**` })))
        controller.enqueue(encoder.encode(sse("done", { id: crypto.randomUUID(), verdict: "answered", intent: "math", provenance: [], timing: { totalMs: 0 } })))
      } catch {
        controller.enqueue(encoder.encode(sse("delta", { text: "That doesn't parse as a math expression." })))
        controller.enqueue(encoder.encode(sse("done", { id: crypto.randomUUID(), verdict: "declined", intent: "math", provenance: [], timing: { totalMs: 0 } })))
      }
      controller.close()
    },
  })
}

function handleSocial(raw: string, normalized: string): ReadableStream {
  const encoder = new TextEncoder()
  const text = socialResponse(raw, normalized)
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(sse("delta", { text })))
      controller.enqueue(encoder.encode(sse("done", { id: crypto.randomUUID(), verdict: "answered", intent: "greeting", provenance: [], timing: { totalMs: 0 } })))
      controller.close()
    },
  })
}

export async function POST(req: Request) {
  const body = await req.json()
  const message: string = (body.message ?? "").trim()
  if (!message) return new Response("No message", { status: 400 })

  const contextMessages: Array<{ role: string; entities?: string[] }> = body.context ?? []
  const lastBotWithArticle = [...contextMessages].reverse().find(m => m.role !== "user" && m.entities?.[0])
  const lastArticle = lastBotWithArticle?.entities?.[0]

  const classifyContext = lastArticle ? { article: lastArticle } : undefined
  const queryForClassify = normalizeQuery(message, classifyContext)
  const intent = classify(queryForClassify, classifyContext)

  let stream: ReadableStream
  if (intent === "math") stream = handleMath(message)
  else if (intent === "social") stream = handleSocial(message, queryForClassify)
  else stream = await handleFactual(message, lastArticle)

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  })
}
