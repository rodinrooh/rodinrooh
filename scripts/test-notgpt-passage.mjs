#!/usr/bin/env node
/**
 * Passage-level retrieval test for notgpt.
 * These 20 queries test the new DDG + passage-scoring approach.
 * Sealed set — do NOT modify queries if results are bad; fix the retrieval instead.
 * Usage: node scripts/test-notgpt-passage.mjs [--port 3000] [--url http://localhost:3000]
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const { queries } = JSON.parse(readFileSync(join(__dir, 'notgpt-test-passage.json'), 'utf8'))

const PORT = process.argv.includes('--port')
  ? process.argv[process.argv.indexOf('--port') + 1]
  : '3000'
const BASE_URL = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : `http://localhost:${PORT}`

async function ask(query) {
  const res = await fetch(`${BASE_URL}/notgpt/api/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
    body: JSON.stringify({ message: query }),
    signal: AbortSignal.timeout(25000),
  })
  const raw = await res.text()
  const parts = []
  let curEvent = null
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('event:')) {
      curEvent = trimmed.slice(6).trim()
    } else if (trimmed.startsWith('data:')) {
      if (curEvent === 'delta' || curEvent === null) {
        try {
          const d = JSON.parse(trimmed.slice(5).trim())
          if (d.text) parts.push(d.text)
        } catch {}
      }
      curEvent = null
    } else if (trimmed === '') {
      curEvent = null
    }
  }
  return parts.join('')
}

console.log(`\nPassage-level retrieval test — ${queries.length} queries against ${BASE_URL}`)
console.log('='.repeat(70))
console.log('Judgment: does the answer specifically address the mechanism / cause / fact?')
console.log('Not just topically related — does it actually answer what was asked.\n')

const results = []

for (const query of queries) {
  process.stdout.write(`Q: ${query}\n`)
  try {
    const answer = await ask(query)
    const preview = answer.slice(0, 300).replace(/\n/g, ' ')
    console.log(`A: ${preview}${answer.length > 300 ? '...' : ''}\n`)
    results.push({ query, answer, ok: null })
  } catch (e) {
    console.log(`ERROR: ${e.message}\n`)
    results.push({ query, answer: '', ok: false })
  }
}

console.log('='.repeat(70))
console.log(`\nRaw results above — read each answer and judge manually.`)
console.log(`Total queries: ${queries.length}`)
