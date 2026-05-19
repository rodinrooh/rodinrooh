import { NextResponse } from 'next/server'

const USER_ID    = 'user_rjXQOO6LeegHA'
const COMPANY_ID = 'biz_FGJZvCRb7pQmXP'

export async function POST() {
  const res = await fetch(`https://api.whop.com/api/v2/users/${USER_ID}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${process.env.WHOP_API_KEY}`,
      'Content-Type': 'application/json',
      'x-on-behalf-of': COMPANY_ID,
    },
    body: JSON.stringify({ name: 'Visitor' }),
  })
  const data = await res.json()
  return NextResponse.json({ status: res.status, data })
}
