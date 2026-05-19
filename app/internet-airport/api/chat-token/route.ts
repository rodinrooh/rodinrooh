import { NextResponse } from 'next/server'

export async function POST() {
  const response = await fetch('https://api.whop.com/api/v1/access_tokens', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHOP_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      company_id: process.env.WHOP_COMPANY_ID,
      scoped_actions: ['chat:read', 'chat:message:create'],
    }),
  })

  const data = await response.json()
  if (!data.token) {
    return NextResponse.json({ error: 'Token generation failed', detail: data }, { status: 500 })
  }
  return NextResponse.json({ token: data.token })
}
