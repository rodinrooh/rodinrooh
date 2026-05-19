'use client'

import { useMemo } from 'react'
import { ChatElement, ChatSession, Elements } from '@whop/embedded-components-react-js'
import { loadWhopElements } from '@whop/embedded-components-vanilla-js'

const elements = loadWhopElements()

async function getToken(): Promise<string> {
  const res = await fetch('/internet-airport/api/chat-token', { method: 'POST' })
  const data = await res.json()
  if (!data.token) throw new Error('Token fetch failed')
  return data.token
}

const DARK: { theme: { appearance: 'dark' } } = { theme: { appearance: 'dark' } }

export function WhopChat({ onClose }: { onClose: () => void }) {
  const channelId = 'chat_feed_1CbB1T6C6r2YHPK8WFsKco'
  const chatOptions = useMemo(() => ({ channelId, style: 'discord' as const }), [channelId])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px',
        borderBottom: '1px solid #2a2a2a',
        background: '#141414',
        flexShrink: 0,
      }}>
        <span style={{ color: '#888', fontSize: 9, letterSpacing: '0.22em', fontWeight: 700 }}>CHAT</span>
        <button
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: '#555', fontSize: 18, cursor: 'pointer', padding: '0 2px', lineHeight: 1, fontFamily: 'inherit' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#aaa' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#555' }}
        >×</button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Elements elements={elements} appearance={DARK}>
          <ChatSession token={getToken}>
            <ChatElement
              options={chatOptions}
              className="whop-el"
              style={{ height: '100%', width: '100%' }}
            />
          </ChatSession>
        </Elements>
      </div>
      <div style={{
        flexShrink: 0,
        padding: '8px 14px',
        borderTop: '1px solid #1e1e1e',
        background: '#111',
        textAlign: 'center',
      }}>
        <span style={{ color: '#444', fontSize: 9, letterSpacing: '0.16em' }}>
          POWERED BY{' '}
          <a
            href="https://whop.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#f0b020', textDecoration: 'none', letterSpacing: '0.16em' }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = '#f8d060' }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = '#f0b020' }}
          >WHOP</a>
        </span>
      </div>
    </div>
  )
}
