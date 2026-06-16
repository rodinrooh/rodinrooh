"use client"

import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from "react"

type Result = {
  passage: string | null
  url: string | null
  title: string | null
}

function shortHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

const EXAMPLES = [
  "why is the sky blue",
  "how does a vaccine work",
  "what is quantum entanglement",
  "what does salty mean",
  "what causes hiccups",
  "how do muscles grow",
]

export default function NotClaudePage() {
  const [query, setQuery] = useState("")
  const [result, setResult] = useState<Result | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function search(q: string) {
    const trimmed = q.trim()
    if (!trimmed || loading) return
    setLoading(true)
    setError(null)
    setResult(null)
    setSearched(true)

    try {
      const res = await fetch("/notclaude/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setResult(data)
    } catch {
      setError("Something went wrong. Try again.")
    } finally {
      setLoading(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    search(query)
  }

  function onExample(q: string) {
    setQuery(q)
    search(q)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      search(query)
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <main className="flex-1 flex flex-col items-center px-4 pt-24 pb-16">

        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="text-[13px] font-medium tracking-[0.18em] text-neutral-400 uppercase">
            notclaude
          </h1>
          <p className="mt-1 text-[13px] text-neutral-400">
            the answer, verbatim from the source
          </p>
        </div>

        {/* Search */}
        <form onSubmit={onSubmit} className="w-full max-w-xl">
          <div className="flex items-center border-b border-neutral-200 focus-within:border-neutral-900 transition-colors">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="ask anything"
              className="flex-1 py-3 text-[15px] text-neutral-900 placeholder:text-neutral-300 bg-transparent outline-none"
              spellCheck={false}
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={!query.trim() || loading}
              className="ml-3 text-[13px] text-neutral-400 hover:text-neutral-900 disabled:opacity-30 transition-colors"
            >
              {loading ? (
                <span className="inline-block w-4 h-4 border border-neutral-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-label="search">
                  <path d="M14 14L10.133 10.133M11.333 6.667A4.667 4.667 0 1 1 2 6.667a4.667 4.667 0 0 1 9.333 0Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              )}
            </button>
          </div>
        </form>

        {/* Examples — only show before first search */}
        {!searched && (
          <div className="mt-6 flex flex-wrap gap-2 justify-center max-w-xl">
            {EXAMPLES.map(ex => (
              <button
                key={ex}
                onClick={() => onExample(ex)}
                className="text-[12px] text-neutral-400 border border-neutral-200 rounded-full px-3 py-1 hover:border-neutral-400 hover:text-neutral-700 transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        {/* Result */}
        {(result || error) && (
          <div className="mt-10 w-full max-w-xl">
            {error && (
              <p className="text-[13px] text-red-500">{error}</p>
            )}
            {result && !result.passage && (
              <p className="text-[13px] text-neutral-400">
                Nothing found. Try rephrasing your question.
              </p>
            )}
            {result?.passage && (
              <div>
                <blockquote className="text-[15px] leading-relaxed text-neutral-900 border-l-2 border-[#d4854a] pl-4">
                  {result.passage}
                </blockquote>
                {result.url && (
                  <div className="mt-3 flex items-center gap-1.5">
                    <div className="w-3 h-px bg-neutral-300" />
                    <a
                      href={result.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[12px] text-neutral-400 hover:text-neutral-700 transition-colors"
                    >
                      {shortHost(result.url)}
                      {result.title && (
                        <span className="text-neutral-300"> / {result.title.slice(0, 50)}{result.title.length > 50 ? "…" : ""}</span>
                      )}
                    </a>
                    <svg width="9" height="9" viewBox="0 0 9 9" fill="none" className="text-neutral-300" aria-hidden="true">
                      <path d="M1 8L8 1M8 1H3M8 1V6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
