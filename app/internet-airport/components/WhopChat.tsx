'use client'

import { useMemo, useState, useEffect } from 'react'

async function getToken(): Promise<string> {
  const res = await fetch('/internet-airport/api/chat-token', { method: 'POST' })
  const data = await res.json()
  if (!data.token) throw new Error('Token fetch failed')
  return data.token
}

export function WhopChat({ onClose }: { onClose: () => void }) {
  const channelId = process.env.NEXT_PUBLIC_WHOP_CHANNEL_ID ?? ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [components, setComponents] = useState<{ ChatElement: any; ChatSession: any; Elements: any; elements: any } | null>(null)

  useEffect(() => {
    Promise.all([
      import('@whop/embedded-components-react-js'),
      import('@whop/embedded-components-vanilla-js'),
    ]).then(([react, vanilla]) => {
      setComponents({
        ChatElement: react.ChatElement,
        ChatSession: react.ChatSession,
        Elements: react.Elements,
        elements: vanilla.loadWhopElements(),
      })
    })
  }, [])

  const chatOptions = useMemo(() => ({ channelId }), [channelId])

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
        {components ? (
          <components.Elements elements={components.elements}>
            <components.ChatSession token={getToken}>
              <components.ChatElement
                options={chatOptions}
                style={{ height: '100%', width: '100%' }}
              />
            </components.ChatSession>
          </components.Elements>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#444', fontSize: 10, letterSpacing: '0.15em' }}>
            LOADING...
          </div>
        )}
      </div>
    </div>
  )
}
