#!/usr/bin/env node
/**
 * Regression test for notgpt. Re-run this after any change to catch silent regressions.
 * Usage: node scripts/test-notgpt-regression.mjs [--port 3000] [--url http://localhost:3000]
 *
 * The fixtures file (scripts/notgpt-regression.json) should be extended whenever
 * a query is confirmed working. This is the mechanism for preventing whack-a-mole:
 * fixes from past sessions don't silently break in future sessions.
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const fixtures = JSON.parse(readFileSync(join(__dir, 'notgpt-regression.json'), 'utf8'))

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
    signal: AbortSignal.timeout(20000),
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

function check(answer, fixture) {
  const low = answer.toLowerCase()
  const errors = []

  for (const must of (fixture.mustContain || [])) {
    if (!low.includes(must.toLowerCase())) {
      errors.push(`MISSING: "${must}"`)
    }
  }
  for (const mustNot of (fixture.mustNotContain || [])) {
    if (low.includes(mustNot.toLowerCase())) {
      errors.push(`SHOULD NOT CONTAIN: "${mustNot}"`)
    }
  }
  if (fixture.mustNotStart) {
    for (const prefix of fixture.mustNotStart) {
      if (answer.startsWith(prefix)) {
        errors.push(`SHOULD NOT START WITH: "${prefix}"`)
      }
    }
  }
  // Math answers are deliberately short (e.g. "**30**"). Check content not length.
  const isMathAnswer = /^\*\*[\d.,]+\*\*$/.test(answer.trim())
  if (!isMathAnswer && answer.length < 10) {
    errors.push('EMPTY RESPONSE')
  }
  return errors
}

console.log(`\nRunning ${fixtures.fixtures.length} regression fixtures against ${BASE_URL}\n${'='.repeat(60)}`)

let passed = 0, failed = 0
const failures = []

for (const fixture of fixtures.fixtures) {
  process.stdout.write(`Testing: ${fixture.q.slice(0, 50).padEnd(50)} `)
  try {
    const answer = await ask(fixture.q)
    const errors = check(answer, fixture)
    if (errors.length === 0) {
      console.log('✓')
      passed++
    } else {
      console.log('✗')
      failures.push({ q: fixture.q, errors, got: answer.slice(0, 100) })
      failed++
    }
  } catch (e) {
    console.log('✗ ERROR:', e.message)
    failures.push({ q: fixture.q, errors: ['NETWORK ERROR: ' + e.message], got: '' })
    failed++
  }
}

console.log(`\n${'='.repeat(60)}`)
console.log(`PASSED: ${passed}/${passed + failed}`)
if (failures.length > 0) {
  console.log('\nFAILURES:')
  for (const f of failures) {
    console.log(`\n  Q: ${f.q}`)
    for (const e of f.errors) console.log(`     ${e}`)
    if (f.got) console.log(`     Got: "${f.got}"`)
  }
  process.exit(1)
}
