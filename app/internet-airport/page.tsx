'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { flushSync } from 'react-dom'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { supabase } from '@/lib/supabase-airport'

type DomainRow = { id: number; domain: string; shown_at: string | null; score: number | null }
type LeaderRow = { id: number; domain: string; score: number; shown_at: string | null }
type TopFilter = 'day' | 'week' | 'month' | 'all'

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

function getTopFilterCutoff(f: TopFilter): string | null {
  if (f === 'all') return null
  const d = new Date()
  if (f === 'day')   d.setDate(d.getDate() - 1)
  if (f === 'week')  d.setDate(d.getDate() - 7)
  if (f === 'month') d.setMonth(d.getMonth() - 1)
  // date_added is a DATE column — format as YYYY-MM-DD
  return d.toISOString().slice(0, 10)
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
const HDR_H_DESK = 230
const HDR_H_MOB  = 180
const DOM_SLOTS = 17
const TLD_SLOTS = 8

const DW = 26, DH = 40, DFS = 15
const TW = 14, TH = 30, TFS = 10
const NW = 30, NH = 44, NFS = 21
const CW = 36, CH = 48, CFS = 26

const M_DW = 22, M_DH = 34, M_DFS = 13
const M_TW = 12, M_TH = 26, M_TFS = 9
const M_DOM_SLOTS = 8
const M_TLD_SLOTS = 5
const M_TOP_DOM_SLOTS = 7
const M_TOP_TLD_SLOTS = 4

const PAGE_SIZE = 1000

// ── Tile ─────────────────────────────────────────────────────────────────────
function Tile({ ch, w, h, fs, color, tt = TILE_TOP, tb = TILE_BTM }: {
  ch: string; w: number; h: number; fs: number; color: string
  tt?: string; tb?: string
}) {
  return (
    <div style={{
      width: w, height: h, flexShrink: 0,
      background: `linear-gradient(to bottom, ${tt} 50%, ${tb} 50%)`,
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

function SlotRow({ text, w, h, fs, color, slots, gap = 3, rightAlign = false, tt, tb }: {
  text: string; w: number; h: number; fs: number
  color: string; slots: number; gap?: number; rightAlign?: boolean
  tt?: string; tb?: string
}) {
  const chars = Array.from(text.toUpperCase()).slice(0, slots)
  const empties = slots - chars.length
  const emptyTiles = Array.from({ length: empties }, (_, i) => <Tile key={`e${i}`} ch="" w={w} h={h} fs={fs} color={color} tt={tt} tb={tb} />)
  return (
    <div style={{ display: 'flex', gap, alignItems: 'center', flexShrink: 0 }}>
      {rightAlign && emptyTiles}
      {chars.map((ch, i) => <Tile key={i} ch={ch} w={w} h={h} fs={fs} color={color} tt={tt} tb={tb} />)}
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

function BigClock({ now, w = CW, h = CH, fs = CFS }: {
  now: Date | null; w?: number; h?: number; fs?: number
}) {
  if (!now) return <div style={{ height: h }} />
  const pad = (n: number) => String(n).padStart(2, '0')
  const [hr, m, s] = [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())]
  const cfs = Math.round(fs * 0.8)
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      <Tile ch={hr[0]} w={w} h={h} fs={fs} color={LETTER} />
      <Tile ch={hr[1]} w={w} h={h} fs={fs} color={LETTER} />
      <Colon fs={cfs} color="#666" />
      <Tile ch={m[0]} w={w} h={h} fs={fs} color={LETTER} />
      <Tile ch={m[1]} w={w} h={h} fs={fs} color={LETTER} />
      <Colon fs={cfs} color="#666" />
      <Tile ch={s[0]} w={w} h={h} fs={fs} color={LETTER} />
      <Tile ch={s[1]} w={w} h={h} fs={fs} color={LETTER} />
    </div>
  )
}

function PlaneIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="#f0b020" style={{ flexShrink: 0, opacity: 0.85 }}>
      <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
    </svg>
  )
}

function FilterTiles({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  const FW = 16, FH = 26, FFS = 10
  return (
    <div
      onClick={onClick}
      style={{ display: 'flex', gap: 2, cursor: 'pointer', alignItems: 'center' }}
    >
      {Array.from(label).map((ch, i) => (
        <Tile key={i} ch={ch} w={FW} h={FH} fs={FFS}
          color={active ? '#f0b020' : '#444'}
          tt={active ? '#3a2800' : '#202020'}
          tb={active ? '#2a1c00' : '#181818'}
        />
      ))}
    </div>
  )
}

function TabTiles({ label, active, onClick, sm }: {
  label: string; active: boolean; onClick: () => void; sm: boolean
}) {
  const FW = sm ? 13 : 16, FH = sm ? 22 : 26, FFS = sm ? 8 : 10
  return (
    <button onClick={onClick} style={{
      background: 'none', border: 'none', cursor: 'pointer',
      padding: '8px 0', marginRight: sm ? 14 : 20, flexShrink: 0,
    }}>
      <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
        {Array.from(label).map((ch, i) =>
          ch === ' '
            ? <div key={i} style={{ width: 5, flexShrink: 0 }} />
            : <Tile key={i} ch={ch} w={FW} h={FH} fs={FFS}
                color={active ? '#f0b020' : '#3a3a3a'}
                tt={active ? '#3a2800' : '#1a1a1a'}
                tb={active ? '#2a1c00' : '#141414'}
              />
        )}
      </div>
    </button>
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

  const [tab,           setTab]       = useState<'live' | 'top'>('live')
  const [topFilter,     setTopFilter] = useState<TopFilter>('day')
  const [leaderboard,   setLeader]    = useState<LeaderRow[]>([])
  const [leaderLoading, setLL]        = useState(false)

  const [results,   setResults]   = useState<DomainRow[]>([])
  const [rCount,    setRCount]    = useState<number | null>(null)
  const [searching, setSearching] = useState(false)
  const searchTimer               = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [showIntro, setShowIntro] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

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
        const prevScrollY = window.scrollY
        flushSync(() => {
          setDomains(prev => [...incoming, ...prev])
          setTotal(prev => prev + data.length)
        })
        if (prevScrollY > 10) window.scrollBy(0, incoming.length * (isMobile ? 60 : 70))
        setNewIds(new Set(incoming.map(r => r.id)))
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setNewIds(new Set()), 400)
      }
    }, 1000)
    return () => { clearInterval(iv); if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  // Leaderboard — reloads when tab becomes 'top' or topFilter changes
  useEffect(() => {
    if (tab !== 'top') return
    let cancelled = false

    const load = async () => {
      setLL(true)
      const cutoff = getTopFilterCutoff(topFilter)
      let q = supabase.from('domains').select('id, domain, score, shown_at')
        .eq('shown', true).not('score', 'is', null).order('score', { ascending: false }).limit(99)
      if (cutoff) q = q.gte('date_added', cutoff)
      const { data } = await q
      if (!cancelled) {
        setLeader((data as LeaderRow[]) ?? [])
        setLL(false)
      }
    }

    setLeader([])
    load()
    const iv = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [tab, topFilter])

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
  const siteHdrRef = useRef<HTMLDivElement>(null)
  const [siteHdrH, setSiteHdrH] = useState(isMobile ? HDR_H_MOB : HDR_H_DESK)
  useEffect(() => {
    const el = siteHdrRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSiteHdrH(el.offsetHeight))
    ro.observe(el)
    setSiteHdrH(el.offsetHeight)
    return () => ro.disconnect()
  }, [])

  const liveVirtualizer = useWindowVirtualizer({
    count: liveRows.length,
    estimateSize: () => isMobile ? 60 : 70,
    overscan: 50,
    scrollMargin: 0,
  })

  const TOP_FILTER_LABELS: Record<TopFilter, string> = {
    day: '24H', week: '7D', month: '30D', all: 'ALL',
  }

  let countLabel: string
  if (searching) {
    countLabel = 'SEARCHING...'
  } else if (tab === 'top') {
    const filterLabel = TOP_FILTER_LABELS[topFilter]
    countLabel = search
      ? `${filteredLeader.length} MATCHES`
      : `TOP ${leaderboard.length} · ${filterLabel}`
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


  const hdrH = isMobile ? HDR_H_MOB : HDR_H_DESK

  const aDW = isMobile ? M_DW : DW
  const aDH = isMobile ? M_DH : DH
  const aDFS = isMobile ? M_DFS : DFS
  const aTW = isMobile ? M_TW : TW
  const aTH = isMobile ? M_TH : TH
  const aTFS = isMobile ? M_TFS : TFS
  const aDOM = isMobile ? M_DOM_SLOTS : DOM_SLOTS
  const aTLD = isMobile ? M_TLD_SLOTS : TLD_SLOTS

  const domColW = aDOM * aDW + (aDOM - 1) * 3
  const tldColW = aTLD * aTW + (aTLD - 1) * 2
  const timeColW = 4 * NW + 2 * 3 + 22

  const aTopDOM = isMobile ? M_TOP_DOM_SLOTS : DOM_SLOTS
  const aTopTLD = isMobile ? M_TOP_TLD_SLOTS : TLD_SLOTS
  const topDomColW = aTopDOM * aDW + (aTopDOM - 1) * 3
  const topTldColW = aTopTLD * aTW + (aTopTLD - 1) * 2

  const statusColW = isMobile ? 5 * M_TW + 4 * 2 : 5 * TW + 4 * 2

  const LIVE_GRID = isMobile
    ? `${domColW}px ${tldColW}px ${statusColW}px`
    : `${timeColW}px ${domColW}px ${tldColW}px ${statusColW}px`
  const RW = 22, RH = 34, RFS = 13
  const TOP_GRID = isMobile
    ? `${2 * M_TW + 3}px ${topDomColW}px ${topTldColW}px ${statusColW}px`
    : `${2 * RW + 3}px ${topDomColW}px ${topTldColW}px ${3 * RW + 6}px ${statusColW}px`

  return (
    <main style={{ background: PAGE_BG, minHeight: '100vh', overscrollBehaviorY: 'none' }}>

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
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>✈️</div>
              <div style={{ color: '#f0b020', fontSize: 22, letterSpacing: '0.1em', fontWeight: 600, lineHeight: 1 }}>INTERNET AIRPORT</div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: '#222', marginBottom: 20 }} />

            {/* Section 1 */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ color: '#ddd', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>✈️ What is this?</div>
              <div className="modal-body">
                Every domain name registered on the internet, live, displayed as an{' '}
                <a href="https://www.google.com/search?q=airport+split+flap+display&sca_esv=99745c67aa04a219&udm=2&biw=1290&bih=924&sxsrf=ANbL-n706ogtdpHtoZWWST9sh0MmPSMT9A:1779056850237&ei=0kAKar-UDt_JkPIP1KnDoAU&ved=0ahUKEwi_xd-cr8GUAxXfJEQIHdTUEFQQ4dUDCBM&uact=5&oq=airport+split+flap+display&gs_lp=Egtnd3Mtd2l6LWltZyIaYWlycG9ydCBzcGxpdCBmbGFwIGRpc3BsYXkyBxAjGMkCGCcyBxAjGMkCGCcyBhAAGAUYHkjALlDjAljcLXAGeACQAQCYAX2gAd8GqgEEMTUuMbgBA8gBAPgBAZgCCKAC3AHCAgoQABiABBiKBRhDwgIGEAAYCBgewgIIEAAYgAQYsQPCAgUQABiABJgDAIgGAZIHATigB-oVsgcBNLgH0wHCBwMxLjfIBw2ACAE&sclient=gws-wiz-img" target="_blank" rel="noopener noreferrer" style={{ color: '#888', fontWeight: 400, textDecoration: 'underline', textUnderlineOffset: 3 }}>airport split flap board</a>.{' '}
                Domains arriving into the internet, just like flights arriving at an airport.
              </div>
            </div>

            {/* Section 2 */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ color: '#ddd', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>📡 Where&apos;s the data from?</div>
              <div className="modal-body">
                A public database of newly registered domains on{' '}
                <a href="https://www.whoisds.com" target="_blank" rel="noopener noreferrer" style={{ color: '#888', fontWeight: 400, textDecoration: 'underline', textUnderlineOffset: 3 }}>whoisds.com</a>.
              </div>
            </div>

            {/* Section 3 */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ color: '#ddd', fontSize: 13, fontWeight: 600, marginBottom: 5 }}>🏆 Top Arrivals</div>
              <div className="modal-body">
                Every domain gets scored 0 to 100 on quality. GREAT, MID, or TRASH tells you where it landed.
              </div>
            </div>

            {/* CTA */}
            <button
              onClick={dismissIntro}
              style={{
                background: '#f0b020', color: '#111', border: 'none',
                borderRadius: 50, padding: '13px 24px',
                fontSize: 10, letterSpacing: '0.22em', fontWeight: 700,
                cursor: 'pointer', width: '100%', marginBottom: 16,
              }}
            >
              HEAD TO ARRIVALS
            </button>

            {/* Footer */}
            <div style={{ textAlign: 'center', color: '#777', fontSize: 10, letterSpacing: '0.08em', fontWeight: 300 }}>
              By{' '}
              <a href="https://rodinrooh.com" target="_blank" rel="noopener noreferrer"
                style={{ color: '#999', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                Rodin Roohipour
              </a>
              {'. Powered by '}
              <a href="https://whop.com" target="_blank" rel="noopener noreferrer"
                style={{ color: '#999', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                Whop
              </a>
              .
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div ref={siteHdrRef} style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 20,
      }}>
        <div style={{ background: HDR_BG }}>
        <div style={{ maxWidth: isMobile ? '100%' : MAX_W, margin: '0 auto', padding: isMobile ? '12px 16px 16px' : '14px 40px 16px', position: 'relative' }}>

          {/* Info button — top right */}
          {!isMobile && (
            <button
              onClick={() => setShowIntro(true)}
              style={{
                position: 'absolute', top: 14, right: 40,
                width: 22, height: 22, borderRadius: '50%',
                background: 'transparent', border: '1px solid #3a3a3a',
                color: '#555', fontSize: 11, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1, fontFamily: 'inherit', flexShrink: 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#666'; e.currentTarget.style.color = '#aaa' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#3a3a3a'; e.currentTarget.style.color = '#555' }}
            >i</button>
          )}

          {/* Info button — mobile only */}
          {isMobile && (
            <button
              onClick={() => setShowIntro(true)}
              style={{
                position: 'absolute', top: 14, right: 16,
                width: 22, height: 22, borderRadius: '50%',
                background: 'transparent', border: '1px solid #3a3a3a',
                color: '#555', fontSize: 11, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1, fontFamily: 'inherit', flexShrink: 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#666'; e.currentTarget.style.color = '#aaa' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#3a3a3a'; e.currentTarget.style.color = '#555' }}
            >i</button>
          )}

          {/* Title + search + tabs */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMobile ? 'flex-start' : 'center' }}>

            <div style={{ textAlign: isMobile ? 'left' : 'center', marginBottom: 10 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <PlaneIcon />
                <span style={{ color: '#f0b020', fontSize: 26, letterSpacing: '0.12em', fontWeight: 600, lineHeight: 1 }}>
                  INTERNET AIRPORT
                </span>
              </div>
              {!isMobile && (
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                  <BigClock now={now} w={20} h={30} fs={13} />
                </div>
              )}
              <div style={{ color: '#888', fontSize: 9, letterSpacing: '0.22em' }}>
                {countLabel}
              </div>
            </div>

            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="SEARCH ARRIVALS"
              style={{
                display: 'block',
                width: isMobile ? '100%' : 380,
                background: '#111',
                border: '1px solid #222',
                borderRadius: 4,
                outline: 'none', color: '#bbb',
                fontSize: 10, letterSpacing: '0.20em',
                padding: '8px 12px', fontFamily: 'inherit',
                marginBottom: 8,
              }}
            />

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              {(['live', 'top'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  background: tab === t ? '#222' : 'transparent',
                  border: `1px solid ${tab === t ? '#666' : '#333'}`,
                  borderRadius: 4,
                  cursor: 'pointer',
                  color: tab === t ? '#ccc' : '#3a3a3a',
                  fontFamily: 'inherit', fontSize: 10, letterSpacing: '0.22em',
                  fontWeight: tab === t ? 600 : 400,
                  padding: '6px 18px',
                }}>
                  {t === 'live' ? 'LIVE' : 'TOP'}
                </button>
              ))}
            </div>

          </div>
        </div>
        </div>
        {/* This gap is INSIDE the fixed header so it never moves */}
        <div style={{ height: 42, background: PAGE_BG }} />
      </div>

      {/* ── Board ── */}
      <div style={{ maxWidth: isMobile ? '100%' : MAX_W, margin: '0 auto', paddingTop: siteHdrH, paddingBottom: 80 }}>
        <div style={{ margin: isMobile ? '0 8px' : '0 40px' }}>

          {/* Sticky column header — BOARD_BG background masks rows scrolling behind it */}
          <div style={{ position: 'sticky', top: siteHdrH, zIndex: 10, background: BOARD_BG }}>
            {tab === 'top' && (
              <div style={{
                background: BOARD_BG,
                borderTop: '2px solid #1c1c1c', borderLeft: '2px solid #1c1c1c',
                borderRight: '2px solid #1c1c1c', borderBottom: '2px solid #1c1c1c',
                display: 'flex', gap: 10, alignItems: 'center',
                padding: isMobile ? '10px 12px' : '10px 20px',
              }}>
                {(['day', 'week', 'month', 'all'] as TopFilter[]).map(f => (
                  <FilterTiles key={f} label={TOP_FILTER_LABELS[f]} active={topFilter === f} onClick={() => setTopFilter(f)} />
                ))}
              </div>
            )}
            <div style={{
              background: BOARD_BG,
              borderTop: tab === 'top' ? 'none' : '2px solid #1c1c1c',
              borderLeft: '2px solid #1c1c1c', borderRight: '2px solid #1c1c1c',
              display: 'grid',
              gridTemplateColumns: tab === 'live' ? LIVE_GRID : TOP_GRID,
              gap: isMobile ? '0 8px' : '0 16px',
              padding: isMobile ? '8px 12px' : '8px 20px',
              borderBottom: '2px solid #1c1c1c',
            }}>
              {tab === 'live' ? (
                <>
                  {!isMobile && <CH2>TIME</CH2>}
                  <CH2>ARRIVALS</CH2>
                  <CH2>GATE</CH2>
                  <CH2 right>STATUS</CH2>
                </>
              ) : (
                <>
                  <CH2>#</CH2>
                  <CH2>ARRIVALS</CH2>
                  <CH2>GATE</CH2>
                  {!isMobile && <CH2 right>SCORE</CH2>}
                  <CH2 right>STATUS</CH2>
                </>
              )}
            </div>
          </div>

          {/* Rows card — no top border/radius, connects flush to sticky header above */}
          <div style={{
            background: BOARD_BG,
            borderRadius: '0 0 8px 8px',
            border: '2px solid #1c1c1c',
            borderTop: 'none',
          }}>

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
                          gap: isMobile ? '0 8px' : '0 16px',
                          padding: isMobile ? '12px 12px' : '12px 20px',
                          alignItems: 'center',
                          background: '#1e1e1e',
                          borderBottom: '2px solid #1c1c1c',
                          cursor: 'pointer',
                        }}
                      >
                        {!isMobile && <TimeTiles ts={d.shown_at} />}
                        <SlotRow text={getSld(d.domain)} w={aDW} h={aDH} fs={aDFS}
                          color={isNew ? '#f8d060' : '#f0b020'} slots={aDOM} />
                        <SlotRow text={getTld(d.domain)} w={aTW} h={aTH} fs={aTFS}
                          color='#f5f5f5' slots={aTLD} gap={2} />
                        <StatusTiles status={getStatus(d.score)} w={isMobile ? M_TW : TW} h={isMobile ? M_TH : TH} fs={isMobile ? M_TFS : TFS} />
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
                      gap: isMobile ? '0 8px' : '0 16px',
                      padding: isMobile ? '12px 12px' : '12px 20px',
                      alignItems: 'center',
                      background: '#1e1e1e',
                      borderBottom: '2px solid #1c1c1c',
                      cursor: 'pointer',
                    }}
                  >
                    <SlotRow text={String(rank)} w={isMobile ? M_TW : RW} h={isMobile ? M_TH : RH} fs={isMobile ? M_TFS : RFS} color={LETTER} slots={2} rightAlign />
                    <SlotRow text={getSld(d.domain)} w={aDW} h={aDH} fs={aDFS} color='#f0b020' slots={aTopDOM} />
                    <SlotRow text={getTld(d.domain)} w={aTW} h={aTH} fs={aTFS} color='#f5f5f5' slots={aTopTLD} gap={2} />
                    {!isMobile && <SlotRow text={String(d.score)} w={RW} h={RH} fs={RFS} color={LETTER} slots={3} rightAlign />}
                    <StatusTiles status={getStatus(d.score)} w={isMobile ? M_TW : TW} h={isMobile ? M_TH : TH} fs={isMobile ? M_TFS : TFS} />
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

const STATUS_TILE_STYLES = {
  GREAT: { tt: '#0e2414', tb: '#091a0e', color: '#60b878' },
  MID:   { tt: TILE_TOP,  tb: TILE_BTM,  color: '#c0c0c0' },
  TRASH: { tt: '#221100', tb: '#180c00', color: '#e07820' },
}

function StatusTiles({ status, w, h, fs }: {
  status: 'GREAT' | 'MID' | 'TRASH'; w: number; h: number; fs: number
}) {
  const { tt, tb, color } = STATUS_TILE_STYLES[status]
  return <SlotRow text={status} w={w} h={h} fs={fs} color={color} slots={5} gap={2} rightAlign tt={tt} tb={tb} />
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
