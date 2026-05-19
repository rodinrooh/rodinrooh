import { NextResponse } from 'next/server'

const USER_ID = 'user_rjXQOO6LeegHA'

export async function POST() {
  const response = await fetch('https://api.whop.com/api/v1/access_tokens', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHOP_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      user_id: USER_ID,
      scoped_actions: [
        'chat:read',
        'chat:message:create',
        'dms:read',
        'dms:message:manage',
        'dms:channel:manage',
        'support_chat:read',
        'support_chat:message:create',
      ],
    }),
  })

  const data = await response.json()
  if (!data.token) {
    return NextResponse.json({ error: 'Token generation failed', detail: data }, { status: 500 })
  }
  return NextResponse.json({ token: data.token })
}
