'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { supabase } from '@/lib/supabase'

type DomainRow = { id: number; domain: string; shown_at: string | null; score: number | null }
type LeaderRow = { id: number; domain: string; score: number; shown_at: string | null }

function getTld(d: string) { const i = d.lastIndexOf('.'); return i >= 0 ? d.slice(i) : '' }
function getSld(d: string) { const i = d.lastIndexOf('.'); return i >= 0 ? d.slice(0, i) : d }

function getStatus(score: number | null): 'GREAT' | 'MID' | 'TRASH' {
  if (score === null) return 'MID'
  if (score >= 65) return 'GREAT'
  if (score >= 50) return 'MID'
  return 'TRASH'
}

function timeHHMM(ts: string | null): { h: string; m: string } {
  if (!ts) return { h: '--', m: '--' }
  const fmt = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Los_Angeles',
  })
  const parts = fmt.formatToParts(new Date(ts))
  const h = parts.find(p => p.type === 'hour')?.value ?? '--'
  const m = parts.find(p => p.type === 'minute')?.value ?? '--'
  return { h: h === '24' ? '00' : h, m }
}

// ── Tokens ───────────────────────────────────────────────────────────────────
const PAGE_BG  = '#2a2a2a'
const HDR_BG   = '#1e1e1e'
const BOARD_BG = '#252525'
const TILE_TOP = '#272727'
const TILE_BTM = '#1d1d1d'
const LETTER   = '#eeeeee'
const CREASE   = '#0d0d0d'

const MAX_W     = 1020
const HDR_H     = 148
const DOM_SLOTS = 17
const TLD_SLOTS = 8

const DW = 26, DH = 40, DFS = 15
const TW = 14, TH = 30, TFS = 10
const NW = 30, NH = 44, NFS = 21
const CW = 36, CH = 48, CFS = 26

const PAGE_SIZE = 1000

// ── Tile ─────────────────────────────────────────────────────────────────────
function Tile({ ch, w, h, fs, color }: {
  ch: string; w: number; h: number; fs: number; color: string
}) {
  return (
    <div style={{
      width: w, height: h, flexShrink: 0,
      background: `linear-gradient(to bottom, ${TILE_TOP} 50%, ${TILE_BTM} 50%)`,
      borderRadius: 4,
      border: '1px solid #0c0c0c',
      boxShadow: '0 2px 5px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', left: 0, right: 0, top: '50%',
        height: 1.5, background: CREASE, zIndex: 2, pointerEvents: 'none',
      }} />
      {ch ? (
        <span style={{
          fontSize: fs, fontWeight: 500, color, lineHeight: 1,
          position: 'relative', zIndex: 3, letterSpacing: 0,
          textTransform: 'uppercase',
        }}>{ch}</span>
      ) : null}
    </div>
  )
}

function Colon({ fs, color }: { fs: number; color: string }) {
  return (
    <span style={{ color, fontSize: fs, fontWeight: 700, lineHeight: 1, flexShrink: 0, paddingBottom: 3 }}>
      :
    </span>
  )
}

function SlotRow({ text, w, h, fs, color, slots, gap = 3, rightAlign = false }: {
  text: string; w: number; h: number; fs: number
  color: string; slots: number; gap?: number; rightAlign?: boolean
}) {
  const chars = Array.from(text.toUpperCase()).slice(0, slots)
  const empties = slots - chars.length
  const emptyTiles = Array.from({ length: empties }, (_, i) => <Tile key={`e${i}`} ch="" w={w} h={h} fs={fs} color={color} />)
  return (
    <div style={{ display: 'flex', gap, alignItems: 'center', flexShrink: 0 }}>
      {rightAlign && emptyTiles}
      {chars.map((ch, i) => <Tile key={i} ch={ch} w={w} h={h} fs={fs} color={color} />)}
      {!rightAlign && emptyTiles}
    </div>
  )
}

function TimeTiles({ ts }: { ts: string | null }) {
  const { h, m } = timeHHMM(ts)
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      <Tile ch={h[0] ?? '-'} w={NW} h={NH} fs={NFS} color='#f5f5f5' />
      <Tile ch={h[1] ?? '-'} w={NW} h={NH} fs={NFS} color='#f5f5f5' />
      <Colon fs={22} color="#3a3a3a" />
      <Tile ch={m[0] ?? '-'} w={NW} h={NH} fs={NFS} color='#f5f5f5' />
      <Tile ch={m[1] ?? '-'} w={NW} h={NH} fs={NFS} color='#f5f5f5' />
    </div>
  )
}

function BigClock({ now }: { now: Date | null }) {
  if (!now) return <div style={{ width: 260, height: CH }} />
  const pad = (n: number) => String(n).padStart(2, '0')
  const [h, m, s] = [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())]
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      <Tile ch={h[0]} w={CW} h={CH} fs={CFS} color={LETTER} />
      <Tile ch={h[1]} w={CW} h={CH} fs={CFS} color={LETTER} />
      <Colon fs={22} color="#3a3a3a" />
      <Tile ch={m[0]} w={CW} h={CH} fs={CFS} color={LETTER} />
      <Tile ch={m[1]} w={CW} h={CH} fs={CFS} color={LETTER} />
      <Colon fs={22} color="#3a3a3a" />
      <Tile ch={s[0]} w={CW} h={CH} fs={CFS} color={LETTER} />
      <Tile ch={s[1]} w={CW} h={CH} fs={CFS} color={LETTER} />
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function Page() {
  const [domains,  setDomains]  = useState<DomainRow[]>([])
  const [total,    setTotal]    = useState(0)
  const [search,   setSearch]   = useState('')
  const [now,      setNow]      = useState<Date | null>(null)
  const lastIdRef               = useRef(0)
  const [newIds,   setNewIds]   = useState<Set<number>>(new Set())
  const timerRef                = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [tab,           setTab]    = useState<'live' | 'top'>('live')
  const [leaderboard,   setLeader] = useState<LeaderRow[]>([])
  const [leaderLoading, setLL]     = useState(false)
  const leaderLoadedRef            = useRef(false)

  const [results,   setResults]   = useState<DomainRow[]>([])
  const [rCount,    setRCount]    = useState<number | null>(null)
  const [searching, setSearching] = useState(false)
  const searchTimer               = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [showIntro, setShowIntro] = useState(false)

  useEffect(() => {
    if (!sessionStorage.getItem('intro_seen')) setShowIntro(true)
  }, [])

  function dismissIntro() {
    sessionStorage.setItem('intro_seen', '1')
    setShowIntro(false)
  }

  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    supabase.from('domains').select('*', { count: 'exact', head: true }).eq('shown', true)
      .then(({ count }) => { if (count) setTotal(count) })

    const fetchAll = async () => {
      let oldestId = Infinity
      while (true) {
        const q = supabase.from('domains').select('id, domain, shown_at, score')
          .eq('shown', true).order('id', { ascending: false }).limit(PAGE_SIZE)
        const { data } = await (oldestId === Infinity ? q : q.lt('id', oldestId))
        if (!data?.length) break
        if (oldestId === Infinity) lastIdRef.current = data[0].id
        oldestId = data[data.length - 1].id
        setDomains(prev => [...prev, ...data as DomainRow[]])
      }
    }
    fetchAll()

    const iv = setInterval(async () => {
      const { data } = await supabase.from('domains').select('id, domain, shown_at, score')
        .eq('shown', true).gt('id', lastIdRef.current).order('id', { ascending: true })
      if (data?.length) {
        lastIdRef.current = data[data.length - 1].id
        const incoming = [...data].reverse() as DomainRow[]
        setNewIds(new Set(incoming.map(r => r.id)))
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setNewIds(new Set()), 400)
        setDomains(prev => [...incoming, ...prev])
        setTotal(prev => prev + data.length)
      }
    }, 1000)
    return () => { clearInterval(iv); if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  // Leaderboard — loads on first visit, then refreshes every 60s while on tab
  useEffect(() => {
    if (tab !== 'top') return
    const load = () => {
      setLL(true)
      supabase.from('domains').select('id, domain, score, shown_at').eq('shown', true)
        .not('score', 'is', null).order('score', { ascending: false }).limit(99)
        .then(({ data }) => { if (data?.length) setLeader(data as LeaderRow[]); setLL(false) })
    }
    if (!leaderLoadedRef.current) { leaderLoadedRef.current = true; load() }
    const iv = setInterval(load, 60_000)
    return () => clearInterval(iv)
  }, [tab])

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!search) { setResults([]); setRCount(null); setSearching(false); return }
    setSearching(true)
    searchTimer.current = setTimeout(async () => {
      const [{ data }, { count }] = await Promise.all([
        supabase.from('domains').select('id, domain, shown_at, score')
          .eq('shown', true).ilike('domain', `%${search}%`)
          .order('id', { ascending: false }).limit(2000),
        supabase.from('domains').select('*', { count: 'exact', head: true })
          .eq('shown', true).ilike('domain', `%${search}%`),
      ])
      setResults((data as DomainRow[]) ?? [])
      setRCount(count ?? null)
      setSearching(false)
    }, 350)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [search])

  const liveRows = useMemo(
    () => search ? results : domains,
    [search, results, domains]
  )
  const filteredLeader = useMemo(
    () => leaderboard.map((d, i) => ({ d, rank: i + 1 }))
      .filter(({ d }) => !search || d.domain.toLowerCase().includes(search.toLowerCase())),
    [search, leaderboard]
  )

  const liveListRef = useRef<HTMLDivElement>(null)
  const liveVirtualizer = useWindowVirtualizer({
    count: liveRows.length,
    estimateSize: () => 70,
    overscan: 20,
    scrollMargin: 0,
  })

  let countLabel: string
  if (searching) {
    countLabel = 'SEARCHING...'
  } else if (tab === 'top') {
    countLabel = search
      ? `${filteredLeader.length} MATCHES`
      : `TOP ${leaderboard.length}`
  } else if (search && rCount !== null) {
    countLabel = rCount > results.length
      ? `SHOWING ${results.length.toLocaleString()} OF ${rCount.toLocaleString()}`
      : `${rCount.toLocaleString()} MATCHES`
  } else {
    countLabel = `${total.toLocaleString()} ARRIVALS`
  }

  const blurb = tab === 'top'
    ? <>DOMAINS SCORED 0–100 ON QUALITY.<br />SHORT REAL WORDS ON .COM WIN.<br />TOP 99 UPDATED LIVE.</>
    : <>EVERY DOMAIN REGISTERED TODAY<br />LIVE AS IT ARRIVES</>


  const LIVE_GRID = `${4 * NW + 2 * 3 + 22}px ${DOM_SLOTS * DW + (DOM_SLOTS - 1) * 3}px ${TLD_SLOTS * TW + (TLD_SLOTS - 1) * 2}px 90px`
  const RW = 22, RH = 34, RFS = 13
  const TOP_GRID  = `${2 * RW + 1 * 3}px ${DOM_SLOTS * DW + (DOM_SLOTS - 1) * 3}px ${TLD_SLOTS * TW + (TLD_SLOTS - 1) * 2}px ${3 * RW + 2 * 3}px 90px`

  return (
    <main style={{ background: PAGE_BG, minHeight: '100vh' }}>

      {/* ── Intro Modal ── */}
      {showIntro && (
        <div
          onClick={dismissIntro}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.82)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#161616',
              border: '1px solid #2a2a2a',
              borderRadius: 10,
              padding: '36px 40px 28px',
              maxWidth: 460,
              width: '92%',
              boxShadow: '0 32px 80px rgba(0,0,0,0.9)',
            }}
          >
            {/* Header */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ color: '#555', fontSize: 9, letterSpacing: '0.3em', marginBottom: 8 }}>INTERNATIONAL ARRIVALS</div>
              <div style={{ color: '#f0b020', fontSize: 24, letterSpacing: '0.1em', fontWeight: 600, lineHeight: 1 }}>INTERNET AIRPORT</div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: '#222', marginBottom: 24 }} />

            {/* Section 1 */}
            <div style={{ marginBottom: 22 }}>
              <div style={{ color: '#f5f5f5', fontSize: 10, letterSpacing: '0.2em', fontWeight: 700, marginBottom: 8 }}>WHAT IS THIS?</div>
              <div style={{ color: '#888', fontSize: 12, lineHeight: 1.7 }}>
                A live feed of every single domain name registered on the internet. New domains are revealed continuously throughout the day.
              </div>
            </div>

            {/* Section 2 */}
            <div style={{ marginBottom: 22 }}>
              <div style={{ color: '#f5f5f5', fontSize: 10, letterSpacing: '0.2em', fontWeight: 700, marginBottom: 8 }}>WHERE IS THE DATA FROM?</div>
              <div style={{ color: '#888', fontSize: 12, lineHeight: 1.7 }}>
                Domain registration data is sourced from <span style={{ color: '#ccc' }}>WHOIS Daily</span>, which aggregates newly registered domains from registrars worldwide. Around <span style={{ color: '#ccc' }}>70,000+</span> new domains are registered each day.
              </div>
            </div>

            {/* Section 3 */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ color: '#f5f5f5', fontSize: 10, letterSpacing: '0.2em', fontWeight: 700, marginBottom: 8 }}>HOW DOES IT WORK?</div>
              <div style={{ color: '#888', fontSize: 12, lineHeight: 1.7 }}>
                Each row is a domain that just got registered, and landed in the world of the Internet. They scroll in like an airport arrivals board. Every domain name gets a score from 0–100 based on how good it is. <span style={{ color: '#60b878' }}>Great</span> means it&apos;s great, <span style={{ color: '#c0c0c0' }}>Mid</span> means it&apos;s average, and <span style={{ color: '#e07820' }}>Trash</span> means it&apos;s the worst domain name ever.
              </div>
            </div>

            {/* CTA */}
            <button
              onClick={dismissIntro}
              style={{
                background: '#f0b020', color: '#111', border: 'none',
                borderRadius: 4, padding: '11px 24px',
                fontSize: 10, letterSpacing: '0.22em', fontWeight: 700,
                cursor: 'pointer', width: '100%', marginBottom: 16,
              }}
            >
              HEAD TO ARRIVALS
            </button>

            {/* Footer */}
            <div style={{ textAlign: 'center', color: '#3a3a3a', fontSize: 10, letterSpacing: '0.08em' }}>
              By{' '}
              <a
                href="https://rodinrooh.com"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#555', textDecoration: 'none' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#888')}
                onMouseLeave={e => (e.currentTarget.style.color = '#555')}
              >
                Rodin Roohipour
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 20,
        background: HDR_BG,
        borderBottom: '2px solid #181818',
        boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
      }}>
        <div style={{ maxWidth: MAX_W, margin: '0 auto', padding: '14px 40px 0', position: 'relative' }}>

          {/* Clock + blurb — top right */}
          <div style={{ position: 'absolute', top: 14, right: 40, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
            <BigClock now={now} />
            <div style={{ color: '#f5f5f5', fontSize: 9, letterSpacing: '0.2em', textAlign: 'right', lineHeight: 1.7 }}>
              {blurb}
            </div>
          </div>

          {/* Left-aligned title + search + tabs */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>

            <div style={{ textAlign: 'left', marginBottom: 12 }}>
              <div style={{ color: '#f5f5f5', fontSize: 9, letterSpacing: '0.32em', marginBottom: 5 }}>
                INTERNATIONAL ARRIVALS
              </div>
              <div style={{ color: '#f0b020', fontSize: 26, letterSpacing: '0.12em', fontWeight: 600, lineHeight: 1 }}>
                INTERNET AIRPORT
              </div>
              <div style={{ color: '#f5f5f5', fontSize: 9, letterSpacing: '0.22em', marginTop: 5 }}>
                {countLabel}
              </div>
            </div>

            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="SEARCH ARRIVALS..."
              style={{
                display: 'block', width: '100%', maxWidth: 480,
                background: 'transparent', border: 'none',
                borderBottom: '1px solid #3a3a3a',
                outline: 'none', color: '#bbb',
                fontSize: 11, letterSpacing: '0.16em',
                padding: '6px 0 8px', fontFamily: 'inherit',
                textAlign: 'left',
              }}
            />

            <div style={{ display: 'flex' }}>
              {(['live', 'top'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  background: 'transparent', border: 'none',
                  borderBottom: tab === t ? '2px solid #888' : '2px solid transparent',
                  color: tab === t ? '#f5f5f5' : '#666',
                  fontFamily: 'inherit', fontSize: 9, letterSpacing: '0.28em',
                  cursor: 'pointer', padding: '9px 24px 6px 0',
                  fontWeight: tab === t ? 700 : 400,
                }}>
                  {t === 'live' ? 'LIVE ARRIVALS' : 'TOP ARRIVALS'}
                </button>
              ))}
            </div>

          </div>
        </div>
      </div>

      {/* ── Board ── */}
      <div style={{ maxWidth: MAX_W, margin: '0 auto', paddingTop: HDR_H + 20, paddingBottom: 80 }}>
        <div style={{ margin: '0 40px' }}>
          <div style={{
            background: BOARD_BG,
            borderRadius: 8,
            border: '2px solid #1c1c1c',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            overflow: 'clip',
          }}>

            {/* Column headers */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: tab === 'live' ? LIVE_GRID : TOP_GRID,
              gap: '0 16px',
              padding: '10px 20px',
              position: 'sticky', top: HDR_H, zIndex: 9,
              background: BOARD_BG,
              borderBottom: '2px solid #1c1c1c',
            }}>
              {tab === 'live' ? (
                <>
                  <CH2>TIME</CH2>
                  <CH2>DEPARTURE</CH2>
                  <CH2>GATE</CH2>
                  <CH2 right>STATUS</CH2>
                </>
              ) : (
                <>
                  <CH2>#</CH2>
                  <CH2>DEPARTURE</CH2>
                  <CH2>GATE</CH2>
                  <CH2 right>SCORE</CH2>
                  <CH2 right>STATUS</CH2>
                </>
              )}
            </div>

            {/* Live rows */}
            {tab === 'live' && (
              <>
                {liveRows.length === 0 && !searching && <Empty>{search ? 'NO MATCHES' : 'LOADING...'}</Empty>}
                {searching && <Empty>SEARCHING...</Empty>}
                <div ref={liveListRef} style={{ position: 'relative', height: liveVirtualizer.getTotalSize() }}>
                  {liveVirtualizer.getVirtualItems().map(vi => {
                    const d = liveRows[vi.index]
                    if (!d) return null
                    const isNew = newIds.has(d.id)
                    return (
                      <div
                        key={d.id}
                        className={`board-row${isNew ? ' flip-in' : ''}`}
                        onClick={() => window.open(`https://${d.domain}`, '_blank')}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          height: vi.size,
                          transform: `translateY(${vi.start}px)`,
                          display: 'grid',
                          gridTemplateColumns: LIVE_GRID,
                          gap: '0 16px',
                          padding: '12px 20px',
                          alignItems: 'center',
                          background: '#1e1e1e',
                          borderBottom: '2px solid #1c1c1c',
                          cursor: 'pointer',
                        }}
                      >
                        <TimeTiles ts={d.shown_at} />
                        <SlotRow text={getSld(d.domain)} w={DW} h={DH} fs={DFS}
                          color={isNew ? '#f8d060' : '#f0b020'} slots={DOM_SLOTS} />
                        <SlotRow text={getTld(d.domain)} w={TW} h={TH} fs={TFS}
                          color='#f5f5f5' slots={TLD_SLOTS} gap={2} />
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <StatusBadge status={getStatus(d.score)} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* Top rows */}
            {tab === 'top' && (
              <>
                {leaderLoading && <Empty>LOADING...</Empty>}
                {!leaderLoading && filteredLeader.length === 0 && <Empty>{search ? 'NO MATCHES' : 'NO DATA'}</Empty>}
                {filteredLeader.map(({ d, rank }) => (
                  <div
                    key={d.id}
                    className="board-row"
                    onClick={() => window.open(`https://${d.domain}`, '_blank')}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: TOP_GRID,
                      gap: '0 16px',
                      padding: '12px 20px',
                      alignItems: 'center',
                      background: '#1e1e1e',
                      borderBottom: '2px solid #1c1c1c',
                      cursor: 'pointer',
                    }}
                  >
                    <SlotRow text={String(rank)} w={RW} h={RH} fs={RFS} color={LETTER} slots={2} rightAlign />
                    <SlotRow text={getSld(d.domain)} w={DW} h={DH} fs={DFS} color='#f0b020' slots={DOM_SLOTS} />
                    <SlotRow text={getTld(d.domain)} w={TW} h={TH} fs={TFS} color='#f5f5f5' slots={TLD_SLOTS} gap={2} />
                    <SlotRow text={String(d.score)} w={RW} h={RH} fs={RFS} color={LETTER} slots={3} rightAlign />
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <StatusBadge status={getStatus(d.score)} />
                    </div>
                  </div>
                ))}
              </>
            )}

          </div>
        </div>
      </div>
    </main>
  )
}

function CH2({ children, right, center }: { children: React.ReactNode; right?: boolean; center?: boolean }) {
  return (
    <div style={{
      color: '#f0b020', fontSize: 9, letterSpacing: '0.28em', fontWeight: 700,
      textAlign: center ? 'center' : right ? 'right' : 'left',
    }}>{children}</div>
  )
}

const STATUS_STYLES = {
  GREAT: { bg: '#0a1a0e', color: '#60b878', border: '#1a3824' },
  MID:   { bg: '#1a1a1a', color: '#c0c0c0', border: '#383838' },
  TRASH: { bg: '#1a0e00', color: '#e07820', border: '#3a2200' },
}

function StatusBadge({ status }: { status: 'GREAT' | 'MID' | 'TRASH' }) {
  const s = STATUS_STYLES[status]
  return (
    <span style={{
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      fontSize: 9, letterSpacing: '0.18em', fontWeight: 700,
      padding: '5px 0', borderRadius: 3, whiteSpace: 'nowrap',
      display: 'inline-block', width: 72, textAlign: 'center',
    }}>{status}</span>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      color: '#333', fontSize: 11, padding: '48px',
      textAlign: 'center', letterSpacing: '0.18em',
      background: '#1e1e1e', borderBottom: '2px solid #1c1c1c',
    }}>{children}</div>
  )
}
