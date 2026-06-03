"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { Employee, Stats } from "../lib/types"
import { usd, pct, hoursLabel } from "../lib/format"

const MAX = 1_000_000
const STEP = 5_000

export default function GuessGame({ employees, stats }: { employees: Employee[]; stats: Stats }) {
  // Pool of genuinely surprising, on-theme people: anyone with serious overtime.
  // Every reveal has a real OT story and lands — no boring $90k desk job.
  const pool = useMemo(
    () => employees.filter((e) => e.ot > 50_000 && e.base > 0),
    [employees]
  )

  const [person, setPerson] = useState<Employee | null>(null)
  const [guess, setGuess] = useState(250_000)
  const [revealed, setRevealed] = useState(false)
  const [rounds, setRounds] = useState(0)
  const [best, setBest] = useState<number | null>(null)

  const next = useCallback(() => {
    if (pool.length === 0) return
    setPerson(pool[Math.floor(Math.random() * pool.length)])
    setGuess(250_000)
    setRevealed(false)
  }, [pool])

  useEffect(() => {
    next()
  }, [next])

  if (!person) return null

  const actual = person.totalComp
  const diff = actual - guess
  const off = Math.abs(diff)

  function reveal() {
    setRevealed(true)
    setRounds((r) => r + 1)
    setBest((b) => (b === null ? off : Math.min(b, off)))
  }

  const guessPct = Math.min(100, (guess / MAX) * 100)
  const actualPct = Math.min(100, (actual / MAX) * 100)

  return (
    <div className="pay-game">
      <div className="pay-game-prompt">
        <span className="pay-game-q">Guess the pay</span>
        <span className="pay-game-person">
          {person.job} · {person.department} · {hoursLabel(person.hours)} paid hours in {stats.year}
        </span>
      </div>

      <div className="pay-game-readout">
        {!revealed ? (
          <>
            <div className="pay-game-label">Your guess for their total pay</div>
            <div className="pay-game-guess">{usd(guess)}</div>
          </>
        ) : (
          <>
            <div className="pay-game-label">{person.name} took home</div>
            <div className="pay-game-actual">{usd(actual)}</div>
          </>
        )}
      </div>

      {!revealed ? (
        <>
          <input
            className="pay-slider"
            type="range"
            min={STEP}
            max={MAX}
            step={STEP}
            value={Math.min(guess, MAX)}
            onChange={(e) => setGuess(Number(e.target.value))}
            aria-label="Your guess"
          />
          <div className="pay-slider-ends">
            <span>{usd(STEP)}</span>
            <span>{usd(MAX)}+</span>
          </div>
          <button className="pay-game-btn" onClick={reveal}>
            Reveal
          </button>
        </>
      ) : (
        <>
          <div className="pay-game-bar">
            <div className="pay-game-bar-track" />
            <div className="pay-game-bar-mark is-you" style={{ left: `${guessPct}%` }}>
              <span className="pay-game-bar-tag">you · {usd(guess)}</span>
            </div>
            <div className="pay-game-bar-mark is-real" style={{ left: `${actualPct}%` }}>
              <span className="pay-game-bar-tag">real · {usd(actual)}</span>
            </div>
          </div>

          <p className="pay-game-verdict">
            You were <strong>{usd(off)}</strong> {diff > 0 ? "under" : "over"}.{" "}
            {person.base > 0 && (
              <>
                Base {usd(person.base)} · <strong>{usd(person.ot)} in overtime</strong>
                {person.otPct != null ? ` (${pct(person.otPct)} of base)` : ""}.
              </>
            )}
          </p>

          <div className="pay-game-footer">
            <span className="pay-game-score">
              {rounds} played{best != null ? ` · closest: within ${usd(best)}` : ""}
            </span>
            <button className="pay-game-btn is-ghost" onClick={next}>
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  )
}
