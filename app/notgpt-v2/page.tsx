"use client"
import { useState, useRef } from "react"

export default function NotGPTV2() {
  const [messages, setMessages] = useState<Array<{ role: "user" | "bot"; text: string; source?: string }>>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  async function submit() {
    const q = input.trim()
    if (!q || loading) return
    setInput("")
    setLoading(true)
    setMessages(m => [...m, { role: "user", text: q }])

    const botIdx = messages.length + 1
    setMessages(m => [...m, { role: "bot", text: "" }])

    const abort = new AbortController()
    abortRef.current = abort

    try {
      const res = await fetch("/notgpt-v2/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q }),
        signal: abort.signal,
      })

      const reader = res.body!.getReader()
      const dec = new TextDecoder()
      let buf = ""
      let source = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split("\n")
        buf = lines.pop() ?? ""

        let curEvent = ""
        for (const line of lines) {
          if (line.startsWith("event:")) curEvent = line.slice(6).trim()
          else if (line.startsWith("data:")) {
            try {
              const d = JSON.parse(line.slice(5))
              if (curEvent === "delta" && d.text) {
                setMessages(m => m.map((msg, i) =>
                  i === botIdx ? { ...msg, text: msg.text + d.text } : msg
                ))
              } else if (curEvent === "provenance" && d.sources?.[0]) {
                source = `${d.sources[0].label} (score: ${d.sources[0].score})`
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }

      if (source) {
        setMessages(m => m.map((msg, i) => i === botIdx ? { ...msg, source } : msg))
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setMessages(m => m.map((msg, i) => i === botIdx ? { ...msg, text: "Error — check console" } : msg))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: "0 20px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>notgpt v2 <span style={{ fontWeight: 400, color: "#666", fontSize: 13 }}>prototype — semantic passage retrieval</span></h1>
      <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, minHeight: 400, padding: 16, marginBottom: 12, background: "#fafafa" }}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: m.role === "user" ? 600 : 400, color: m.role === "user" ? "#111" : "#333", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {m.role === "user" ? `Q: ${m.text}` : m.text || "…"}
            </div>
            {m.source && <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>Source: {m.source}</div>}
          </div>
        ))}
        {!messages.length && <div style={{ color: "#aaa", fontSize: 14 }}>Ask anything. First response loads the 23MB embedding model (~5s cold start).</div>}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
          placeholder="why do planes stay up?"
          style={{ flex: 1, padding: "8px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14 }}
          disabled={loading}
        />
        <button
          onClick={submit}
          disabled={loading || !input.trim()}
          style={{ padding: "8px 16px", background: "#111", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14 }}
        >
          {loading ? "…" : "Ask"}
        </button>
      </div>
    </div>
  )
}
