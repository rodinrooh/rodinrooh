/**
 * notclaude v3-beta-1: LLM-assisted query rewriting
 *
 * This is an experimental variant that uses Claude Haiku as a pre-pass to
 * rewrite conversational follow-up queries into standalone questions BEFORE
 * the retrieval pipeline runs.
 *
 * What it does:
 *   "k so what is dark matter" → "what is dark matter"
 *   "why do we even care about it" (after dark matter) → "why do we care about dark matter"
 *   "lmaooo ok what is the gaussian splat thing" → "what is gaussian splatting"
 *   "eli5 that" (after higgs boson) → "explain the higgs boson simply"
 *
 * The LLM sees the last N turns of conversation and rewrites the current
 * query to be self-contained. It does NOT generate answers — just normalizes
 * the question. The answer still comes verbatim from web search.
 *
 * Why a separate route: the main v3 explicitly avoids LLMs in the pipeline.
 * This branch tests whether LLM preprocessing improves quality enough to
 * justify the latency/cost tradeoff (~200ms + ~$0.00025 per Haiku call).
 */

import { NextRequest, NextResponse } from "next/server"
import { retrieveBestPassage } from "../../engine/retrieve"

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const CLAUDE_HAIKU = "claude-haiku-4-5-20251001"

type Turn = { role: "user" | "assistant"; content: string }

/**
 * Rewrite a conversational query into a standalone question using Claude Haiku.
 * Returns the rewritten query and the updated conversation history.
 */
async function rewriteQuery(
  query: string,
  history: Turn[]
): Promise<{ standalone: string; newHistory: Turn[] }> {
  if (!ANTHROPIC_API_KEY) {
    return { standalone: query, newHistory: [...history, { role: "user", content: query }] }
  }

  const systemPrompt = `You rewrite conversational search queries to be self-contained.
Given a conversation history and a follow-up query, output ONLY the rewritten standalone question.
Rules:
- Strip informal filler (lmao, lol, ok, k, yo, bruh, fr, tbh, etc.)
- Replace pronouns with their referents from the conversation
- Expand shorthand like "eli5" to "explain simply"
- If the query is already standalone, return it unchanged (cleaned up)
- Never answer the question — only rewrite it
- Output ONLY the rewritten question, nothing else`

  const messages = [
    ...history.slice(-6),  // last 3 exchanges for context
    { role: "user" as const, content: `Query to rewrite: "${query}"` }
  ]

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_HAIKU,
        max_tokens: 100,
        system: systemPrompt,
        messages,
      }),
      signal: AbortSignal.timeout(4_000),
    })

    if (res.ok) {
      const data = await res.json()
      const rewritten = data.content?.[0]?.text?.trim()
      if (rewritten && rewritten.length > 2 && rewritten.length < 200) {
        return {
          standalone: rewritten,
          newHistory: [...history, { role: "user", content: query }]
        }
      }
    }
  } catch { /* fall through to original query */ }

  return { standalone: query, newHistory: [...history, { role: "user", content: query }] }
}

export async function POST(req: NextRequest) {
  let query: string
  let history: Turn[]

  try {
    const body = await req.json()
    query   = typeof body?.query   === "string" ? body.query.trim() : ""
    history = Array.isArray(body?.history) ? body.history : []
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 })
  }

  if (!query || query.length < 1) {
    return NextResponse.json({ error: "query too short" }, { status: 400 })
  }

  // Step 1: LLM rewrites the query to be self-contained
  const { standalone, newHistory } = await rewriteQuery(query, history)

  // Step 2: Same retrieval pipeline as v3 (verbatim from web, cross-encoder reranking)
  const result = await retrieveBestPassage(standalone)

  if (!result) {
    return NextResponse.json({
      passage: null, url: null, title: null,
      originalQuery: query,
      rewrittenQuery: standalone,
      history: [...newHistory, { role: "assistant", content: "(nothing found)" }],
    }, { status: 200 })
  }

  const updatedHistory: Turn[] = [
    ...newHistory,
    { role: "assistant", content: result.passage }
  ]

  return NextResponse.json({
    passage: result.passage,
    url:     result.url,
    title:   result.title,
    score:   result.score,
    originalQuery:  query,
    rewrittenQuery: standalone,
    history: updatedHistory,
  })
}
