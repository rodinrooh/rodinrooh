import { NextRequest, NextResponse } from "next/server"
import { retrieveBestPassage } from "../../engine/retrieve"

export async function POST(req: NextRequest) {
  let query: string
  try {
    const body = await req.json()
    query = typeof body?.query === "string" ? body.query.trim() : ""
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 })
  }

  if (!query || query.length < 2) {
    return NextResponse.json({ error: "query too short" }, { status: 400 })
  }
  if (query.length > 500) {
    return NextResponse.json({ error: "query too long" }, { status: 400 })
  }

  const result = await retrieveBestPassage(query)
  if (!result) {
    return NextResponse.json({ passage: null, url: null, title: null }, { status: 200 })
  }

  return NextResponse.json({
    passage: result.passage,
    url: result.url,
    title: result.title,
    score: result.score,
  })
}
