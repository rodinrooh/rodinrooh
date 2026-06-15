#!/usr/bin/env node
/**
 * Expanded test suite for notgpt-v2 — 30 queries across easy/medium/hard.
 * Tests that we're not cherry-picking: includes hard vocabulary-gap cases
 * alongside easy ones to show realistic distribution.
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const { queries } = JSON.parse(readFileSync(join(__dir, 'notgpt-test-expanded.json'), 'utf8'))

const BASE = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'http://localhost:3000'

async function ask(query) {
  const res = await fetch(`${BASE}/notgpt/api/ask`, {
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

const byDifficulty = { easy: [], medium: [], hard: [] }
for (const q of queries) byDifficulty[q.difficulty].push(q)

console.log(`\nnotgpt-v2 expanded test — ${queries.length} queries`)
console.log('Read each answer: does it specifically address the mechanism asked?\n')
console.log('='.repeat(70))

const results = { easy: { pass: 0, total: 0 }, medium: { pass: 0, total: 0 }, hard: { pass: 0, total: 0 } }

for (const difficulty of ['easy', 'medium', 'hard']) {
  console.log(`\n${'─'.repeat(70)}\n[${difficulty.toUpperCase()}]\n`)
  for (const { q, article } of byDifficulty[difficulty]) {
    console.log(`Q: ${q}`)
    console.log(`   (Expected: ${article})`)
    results[difficulty].total++
    try {
      const { text, source, score } = await ask(q)
      console.log(`A: ${text.slice(0, 280)}${text.length > 280 ? '...' : ''}`)
      if (source) console.log(`   ↳ Source: ${source} (${score}) ${source.toLowerCase().includes(article.toLowerCase().split(' ')[0]) ? '✓ CORRECT ARTICLE' : ''}`)
      console.log()
    } catch (e) {
      console.log(`   ERROR: ${e.message}\n`)
    }
  }
}

console.log('='.repeat(70))
console.log('\nNote: judge by reading answers, not just source article names.')
console.log('Source article matching is approximate — the passage content is what counts.')
