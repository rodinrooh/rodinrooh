#!/usr/bin/env node
/**
 * Test runner for notgpt-v2 (semantic embedding prototype).
 * Tests the sealed passage set — read the actual answers and judge honestly.
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const { queries } = JSON.parse(readFileSync(join(__dir, 'notgpt-test-passage.json'), 'utf8'))

const PORT = process.argv.includes('--port')
  ? process.argv[process.argv.indexOf('--port') + 1]
  : '3000'
const BASE = `http://localhost:${PORT}`

async function ask(query) {
  const res = await fetch(`${BASE}/notgpt-v2/api/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: query }),
    signal: AbortSignal.timeout(60000),
  })
  const raw = await res.text()
  let text = '', source = '', score = null
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (t.startsWith('data:')) {
      try {
        const d = JSON.parse(t.slice(5))
        if (d.text) text += d.text
        if (d.sources?.[0]) { source = d.sources[0].label; score = d.sources[0].score }
      } catch {}
    }
  }
  return { text: text.trim(), source, score }
}

console.log(`\nnotgpt-v2 passage retrieval test — ${queries.length} queries`)
console.log('Model: all-MiniLM-L6-v2 (semantic embeddings, no word lists)')
console.log('='.repeat(70))

for (const query of queries) {
  console.log(`\nQ: ${query}`)
  try {
    const { text, source, score } = await ask(query)
    console.log(`A: ${text.slice(0, 300)}${text.length > 300 ? '...' : ''}`)
    if (source) console.log(`   Source: ${source} (similarity: ${score})`)
  } catch (e) {
    console.log(`ERROR: ${e.message}`)
  }
}

console.log('\n' + '='.repeat(70))
console.log('Review each answer above: does it specifically address the mechanism/cause asked?')
