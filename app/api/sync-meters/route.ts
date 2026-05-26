import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

export const maxDuration = 60

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN
const DATASF_APP_TOKEN = process.env.DATASF_APP_TOKEN
const SYNC_SECRET = process.env.SYNC_SECRET

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function yesterdayDateStr() {
  const ptToday = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })
  const d = new Date(ptToday + "T12:00:00")
  d.setDate(d.getDate() - 1)
  return d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })
}

export async function POST(req: NextRequest) {
  if (SYNC_SECRET) {
    const auth = req.headers.get("x-sync-secret")
    if (auth !== SYNC_SECRET) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return NextResponse.json({ error: "missing supabase env" }, { status: 500 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const log: string[] = []

  try {
    // --- Fetch & upsert ---
    const dateStr = yesterdayDateStr()
    const start = `${dateStr}T00:00:00`
    const end = `${dateStr}T23:59:59`
    const where = [
      `session_start_dt >= '${start}'`,
      `session_start_dt <= '${end}'`,
      `meter_event_type='NS'`,
      `street_block NOT LIKE '%Garage%'`,
      `street_block NOT LIKE '%Lot%'`,
    ].join(" AND ")

    const url =
      `https://data.sfgov.org/resource/imvp-dq3v.json` +
      `?$where=${encodeURIComponent(where)}&$order=session_start_dt%20ASC&$limit=50000`

    const headers: Record<string, string> = { Accept: "application/json" }
    if (DATASF_APP_TOKEN) headers["X-App-Token"] = DATASF_APP_TOKEN

    const res = await fetch(url, { headers })
    if (!res.ok) throw new Error(`DataSF ${res.status}`)
    const rows = await res.json()
    log.push(`fetched ${rows.length} rows`)

    if (rows.length > 0) {
      const records = rows.map((row: Record<string, string>) => ({
        transmission_datetime: row.transmission_datetime,
        post_id: row.post_id ?? null,
        street_block: row.street_block ?? null,
        payment_type: row.payment_type ?? null,
        session_start_dt: row.session_start_dt ?? null,
        gross_paid_amt: row.gross_paid_amt != null ? parseFloat(row.gross_paid_amt) : null,
        meter_event_type: row.meter_event_type ?? null,
      }))
      const { error } = await supabase
        .from("sf_meter_transactions")
        .upsert(records, { onConflict: "transmission_datetime", ignoreDuplicates: true })
      if (error) throw new Error(`upsert: ${error.message}`)
      log.push(`upserted ${records.length} rows`)

      const totalRevenue = rows.reduce((s: number, r: Record<string, string>) => s + (parseFloat(r.gross_paid_amt) || 0), 0)
      await supabase.from("sf_meter_daily_stats").upsert(
        { date: dateStr, total_sessions: rows.length, total_revenue: totalRevenue },
        { onConflict: "date" }
      )
    }

    // --- Geocode by block (cached) ---
    if (MAPBOX_TOKEN) {
      // Step 1: instantly apply any already-cached block coordinates to ungeocoded transactions
      const { data: cachedBlocks } = await supabase.from("sf_meter_blocks").select("street_block, lat, lng")
      if (cachedBlocks && cachedBlocks.length > 0) {
        for (const b of cachedBlocks) {
          if (b.lat !== null && b.lng !== null) {
            await supabase.from("sf_meter_transactions")
              .update({ lat: b.lat, lng: b.lng, geocoded: true })
              .eq("street_block", b.street_block)
              .eq("geocoded", false)
          } else {
            await supabase.from("sf_meter_transactions")
              .update({ geocoded: true })
              .eq("street_block", b.street_block)
              .eq("geocoded", false)
          }
        }
        log.push(`applied ${cachedBlocks.length} cached blocks`)
      }

      // Step 2: find remaining unique blocks that still need geocoding
      const { data: pending } = await supabase
        .from("sf_meter_transactions")
        .select("street_block")
        .eq("geocoded", false)
        .is("lat", null)
        .limit(2000)

      const uniqueBlocks = [...new Set((pending ?? []).map((r) => r.street_block).filter(Boolean))]

      if (uniqueBlocks.length > 0) {
        log.push(`geocoding ${uniqueBlocks.length} new blocks`)
        let geocodedBlocks = 0
        const deadline = Date.now() + 20000

        for (const block of uniqueBlocks) {
          if (Date.now() > deadline) break

          const q = encodeURIComponent(`${block}, San Francisco, CA`)
          const gres = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?access_token=${MAPBOX_TOKEN}&limit=1&country=US`
          )
          if (!gres.ok) { await sleep(100); continue }

          const json = await gres.json()
          const feature = json.features?.[0]
          const lat: number | null = feature ? feature.center[1] : null
          const lng: number | null = feature ? feature.center[0] : null

          // Cache the block result so future runs skip Mapbox entirely
          await supabase.from("sf_meter_blocks")
            .upsert({ street_block: block, lat, lng }, { onConflict: "street_block" })

          // Update every transaction for this block in one query
          if (lat !== null && lng !== null) {
            await supabase.from("sf_meter_transactions")
              .update({ lat, lng, geocoded: true })
              .eq("street_block", block)
              .eq("geocoded", false)
            geocodedBlocks++
          } else {
            await supabase.from("sf_meter_transactions")
              .update({ geocoded: true })
              .eq("street_block", block)
              .eq("geocoded", false)
          }

          await sleep(100)
        }

        log.push(`geocoded ${geocodedBlocks} new blocks this run`)
      } else {
        log.push("all blocks geocoded")
      }
    }

    return NextResponse.json({ ok: true, log })
  } catch (err) {
    return NextResponse.json({ error: String(err), log }, { status: 500 })
  }
}
