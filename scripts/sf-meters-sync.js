// @ts-check
"use strict"

const { createClient } = require("@supabase/supabase-js")

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN
const DATASF_APP_TOKEN = process.env.DATASF_APP_TOKEN

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
  process.exit(1)
}

if (!MAPBOX_TOKEN) {
  console.warn("Warning: MAPBOX_TOKEN not set — geocoding will be skipped")
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function yesterdayDateStr() {
  const ptToday = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })
  const d = new Date(ptToday + "T12:00:00")
  d.setDate(d.getDate() - 1)
  return d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" })
}


async function fetchDataSF(targetDateStr) {
  const start = `${targetDateStr}T00:00:00`
  const end = `${targetDateStr}T23:59:59`
  console.log(`Fetching data for ${targetDateStr}`)

  const where = [
    `session_start_dt >= '${start}'`,
    `session_start_dt <= '${end}'`,
    `meter_event_type='NS'`,
    `street_block NOT LIKE '%Garage%'`,
    `street_block NOT LIKE '%Lot%'`,
  ].join(" AND ")

  const url =
    `https://data.sfgov.org/resource/imvp-dq3v.json` +
    `?$where=${encodeURIComponent(where)}` +
    `&$order=session_start_dt%20ASC` +
    `&$limit=50000`

  const headers = { "Accept": "application/json" }
  if (DATASF_APP_TOKEN) {
    headers["X-App-Token"] = DATASF_APP_TOKEN
  }

  const res = await fetch(url, { headers })
  if (!res.ok) {
    throw new Error(`DataSF fetch failed: ${res.status} ${await res.text()}`)
  }
  return res.json()
}

async function upsertTransactions(rows) {
  const records = rows.map((row) => ({
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

  if (error) throw new Error(`Upsert failed: ${error.message}`)
  return records.length
}

async function geocodePending() {
  if (!MAPBOX_TOKEN) return

  const { data, error } = await supabase
    .from("sf_meter_transactions")
    .select("id, street_block, session_start_dt")
    .eq("geocoded", false)
    .is("lat", null)
    .range(0, 9999)

  if (error) {
    console.error("Error fetching ungeocoded rows:", error.message)
    return
  }

  if (!data || data.length === 0) {
    console.log("No rows to geocode")
    return
  }

  console.log(`Geocoding ${data.length} rows…`)
  let geocoded = 0

  for (const row of data) {
    const query = encodeURIComponent(`${row.street_block}, San Francisco, CA`)
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${MAPBOX_TOKEN}&limit=1&country=US`

    try {
      const res = await fetch(url)
      if (!res.ok) {
        console.warn(`Geocode HTTP ${res.status} for "${row.street_block}"`)
        await sleep(100)
        continue
      }
      const json = await res.json()
      const feature = json.features?.[0]

      if (!feature) {
        // Mark geocoded=true with null lat/lng so we don't retry indefinitely
        await supabase
          .from("sf_meter_transactions")
          .update({ geocoded: true })
          .eq("id", row.id)
        await sleep(100)
        continue
      }

      const [lng, lat] = feature.center
      const { error: updateError } = await supabase
        .from("sf_meter_transactions")
        .update({ lat, lng, geocoded: true })
        .eq("id", row.id)

      if (updateError) {
        console.warn(`Failed to update lat/lng for ${row.id}: ${updateError.message}`)
      } else {
        geocoded++
      }
    } catch (err) {
      console.warn(`Geocode error for "${row.street_block}":`, err.message)
    }

    await sleep(100)
  }

  console.log(`Geocoded ${geocoded}/${data.length} rows`)
}

async function upsertDailyStats(dateStr, totalSessions, totalRevenue) {
  const { error } = await supabase
    .from("sf_meter_daily_stats")
    .upsert({ date: dateStr, total_sessions: totalSessions, total_revenue: totalRevenue }, { onConflict: "date" })
  if (error) console.warn("Daily stats upsert failed:", error.message)
  else console.log(`Daily stats saved: ${dateStr} — ${totalSessions} sessions, $${totalRevenue.toFixed(2)}`)
}

async function main() {
  console.log("SF Meters sync starting…")

  const targetDateStr = yesterdayDateStr()
  console.log(`Target date: ${targetDateStr}`)

  const rows = await fetchDataSF(targetDateStr)
  console.log(`Fetched ${rows.length} rows from DataSF`)

  if (rows.length === 0) {
    console.log("No new data — running geocoding pass")
    await geocodePending()
    console.log("Done")
    return
  }

  const count = await upsertTransactions(rows)
  console.log(`Upserted ${count} rows`)

  // Save full-day totals for historical stats (uses all rows from DataSF, not time-filtered)
  const totalRevenue = rows.reduce((sum, r) => sum + (parseFloat(r.gross_paid_amt) || 0), 0)
  await upsertDailyStats(targetDateStr, rows.length, totalRevenue)

  await geocodePending()
  console.log("Sync complete")
}

main().catch((err) => {
  console.error("Sync failed:", err)
  process.exit(1)
})
