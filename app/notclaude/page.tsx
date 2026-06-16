"use client"

import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from "react"

type Turn = {
  id: string
  raw: string            // what the user typed
  resolved?: string      // what actually got searched
  passage: string | null
  url: string | null
  title: string | null
}

type ApiResponse = {
  passage: string | null
  url: string | null
  title: string | null
  resolvedQuery?: string
  nextContext?: string
  error?: string
}

function shortHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, "") } catch { return url }
}

function genId() { return Math.random().toString(36).slice(2, 9) }

// Shown when nothing is found — short, honest, a little wry
const MISS_LINES = [
  "nothing. drew a blank on that one.",
  "hmm. couldn't find it. try rewording?",
  "went looking. came back empty.",
  "stumped. different angle?",
  "even google's vague on this apparently.",
  "that one's above my pay grade.",
  "no luck. what else?",
  "crickets. try asking differently.",
]

function missLine(seed: number) {
  return MISS_LINES[seed % MISS_LINES.length]
}

const EXAMPLES = [
  "what is quantum entanglement",
  "why does music give you chills",
  "who invented the internet",
  "what even is a derivative",
  "why are cats afraid of cucumbers",
  "what is the Dunning-Kruger effect",
]

// Small accent asterisk (matches notgpt logo)
function Asterisk({ size = 16 }: { size?: number }) {
  const c = size / 2, r = size * 0.42
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" aria-hidden>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI * 2) / 8
        return <line key={i} x1={c} y1={c} x2={c + r * Math.cos(a)} y2={c + r * Math.sin(a)}
          stroke="#d4854a" strokeWidth={size > 20 ? 2 : 1.5} strokeLinecap="round" />
      })}
    </svg>
  )
}

export default function NotClaudePage() {
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [context, setContext] = useState("")   // current topic entity
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)
  const missCount = useRef(0)

  // Auto-scroll to latest
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [turns, loading])

  // Focus input on mount
  useEffect(() => { inputRef.current?.focus() }, [])

  async function submit(raw: string) {
    const q = raw.trim()
    if (!q || loading) return

    const id = genId()
    setTurns(prev => [...prev, { id, raw: q, passage: null, url: null, title: null }])
    setInput("")
    setLoading(true)

    try {
      const res = await fetch("/notclaude/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, context }),
      })
      const data: ApiResponse = await res.json()

      // Update context from what the server tracked
      if (data.nextContext) setContext(data.nextContext)

      setTurns(prev => prev.map(t =>
        t.id === id ? {
          ...t,
          resolved: data.resolvedQuery !== q ? data.resolvedQuery : undefined,
          passage:  data.passage,
          url:      data.url,
          title:    data.title,
        } : t
      ))
    } catch {
      setTurns(prev => prev.map(t =>
        t.id === id ? { ...t, passage: null, url: null, title: null } : t
      ))
    } finally {
      setLoading(false)
      // Re-focus input so user can keep typing
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function onSubmit(e: FormEvent) { e.preventDefault(); submit(input) }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(input) }
  }

  const isEmpty = turns.length === 0

  return (
    <div className="min-h-screen bg-white flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-2 px-5 py-4 border-b border-neutral-100">
        <Asterisk size={14} />
        <span className="text-[12px] font-medium tracking-[0.15em] text-neutral-400 uppercase">
          notclaude
        </span>
        {context && (
          <span className="ml-auto text-[11px] text-neutral-300 truncate max-w-[200px]">
            about: {context}
          </span>
        )}
      </header>

      {/* ── Conversation ────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto px-5 py-6">
        <div className="max-w-2xl mx-auto space-y-8">

          {/* Empty state */}
          {isEmpty && (
            <div className="pt-16 text-center">
              <p className="text-[13px] text-neutral-400 mb-6">
                ask anything. get the answer, verbatim from the source.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {EXAMPLES.map(ex => (
                  <button key={ex} onClick={() => submit(ex)}
                    className="text-[12px] text-neutral-400 border border-neutral-200 rounded-full px-3 py-1 hover:border-neutral-400 hover:text-neutral-700 transition-colors">
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message turns */}
          {turns.map((turn, i) => {
            const isNull = turn.passage === null && turn.url === null
            const isPending = isNull && loading && i === turns.length - 1
            return (
              <div key={turn.id} className="space-y-2">
                {/* User query */}
                <div className="flex items-start gap-2">
                  <span className="text-[11px] text-neutral-300 mt-0.5 shrink-0">→</span>
                  <span className="text-[14px] text-neutral-600">{turn.raw}</span>
                </div>

                {/* Resolution hint — subtle, only if query was rewritten */}
                {turn.resolved && (
                  <p className="text-[11px] text-neutral-300 pl-4 italic">
                    searched: {turn.resolved}
                  </p>
                )}

                {/* Answer */}
                {isPending ? (
                  <div className="pl-4">
                    <span className="inline-block w-3 h-3 border border-neutral-300 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : turn.passage ? (
                  <div className="pl-4">
                    <blockquote className="text-[15px] leading-relaxed text-neutral-900 border-l-2 border-[#d4854a] pl-4">
                      {turn.passage}
                    </blockquote>
                    {turn.url && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <span className="w-3 h-px bg-neutral-200 shrink-0" />
                        <a href={turn.url} target="_blank" rel="noopener noreferrer"
                          className="text-[11px] text-neutral-400 hover:text-neutral-700 transition-colors truncate">
                          {shortHost(turn.url)}
                          {turn.title && (
                            <span className="text-neutral-300"> / {turn.title.replace(/\s*[-|–].*$/, "").slice(0, 50)}</span>
                          )}
                        </a>
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className="text-neutral-300 shrink-0" aria-hidden>
                          <path d="M1 7L7 1M7 1H3M7 1V5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    )}
                  </div>
                ) : !isPending ? (
                  <p className="pl-4 text-[13px] text-neutral-400 italic">
                    {missLine(missCount.current++)}
                  </p>
                ) : null}
              </div>
            )
          })}

          <div ref={bottomRef} />
        </div>
      </main>

      {/* ── Input ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-neutral-100 px-5 py-4 bg-white">
        <form onSubmit={onSubmit} className="max-w-2xl mx-auto flex items-center gap-3">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder={context ? `follow up or ask something new` : `ask anything`}
            className="flex-1 text-[14px] text-neutral-900 placeholder:text-neutral-300 bg-transparent border-b border-neutral-200 pb-1 focus:border-neutral-600 outline-none transition-colors"
            spellCheck={false}
            autoComplete="off"
          />
          <button type="submit" disabled={!input.trim() || loading}
            className="text-neutral-400 hover:text-neutral-800 disabled:opacity-30 transition-colors">
            {loading
              ? <span className="inline-block w-4 h-4 border border-neutral-400 border-t-transparent rounded-full animate-spin" />
              : <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-label="send">
                  <path d="M14 8H2M14 8L9 3M14 8L9 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
            }
          </button>
        </form>
        {context && (
          <p className="max-w-2xl mx-auto mt-2 text-[10px] text-neutral-300">
            talking about: {context} · <button onClick={() => setContext("")} className="underline hover:text-neutral-500">clear</button>
          </p>
        )}
      </footer>
    </div>
  )
}
