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

async function getLastTransmission() {
  const { data, error } = await supabase
    .from("sf_meter_meta")
    .select("value")
    .eq("key", "last_transmission_datetime")
    .single()

  if (error || !data) {
    // Default to 24 hours ago
    return new Date(Date.now() - 86400000).toISOString()
  }
  return data.value
}

async function fetchDataSF(lastDt) {
  // SoQL filter: new sessions only, no garages/lots, after last_dt
  const where = [
    `transmission_datetime > '${lastDt}'`,
    `meter_event_type='NS'`,
    `street_block NOT LIKE '%Garage%'`,
    `street_block NOT LIKE '%Lot%'`,
  ].join(" AND ")

  const url =
    `https://data.sfgov.org/resource/imvp-dq3v.json` +
    `?$where=${encodeURIComponent(where)}` +
    `&$order=transmission_datetime%20ASC` +
    `&$limit=1000`

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

async function updateLastTransmission(maxDt) {
  const { error } = await supabase
    .from("sf_meter_meta")
    .upsert({ key: "last_transmission_datetime", value: maxDt }, { onConflict: "key" })

  if (error) throw new Error(`Meta update failed: ${error.message}`)
}

async function geocodePending() {
  if (!MAPBOX_TOKEN) return

  const { data, error } = await supabase
    .from("sf_meter_transactions")
    .select("id, street_block")
    .eq("geocoded", false)
    .is("lat", null)
    .limit(50)

  if (error) {
    console.error("Error fetching ungeooded rows:", error.message)
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
        // Mark as geocoded=true with null lat/lng so we don't retry indefinitely
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

async function main() {
  console.log("SF Meters sync starting…")

  const lastDt = await getLastTransmission()
  console.log(`Fetching transactions after: ${lastDt}`)

  const rows = await fetchDataSF(lastDt)
  console.log(`Fetched ${rows.length} rows from DataSF`)

  if (rows.length === 0) {
    console.log("No new data — running geocoding pass")
    await geocodePending()
    console.log("Done")
    return
  }

  const count = await upsertTransactions(rows)
  console.log(`Upserted ${count} rows`)

  // Find max transmission_datetime from the batch
  const maxDt = rows.reduce((max, row) => {
    return row.transmission_datetime > max ? row.transmission_datetime : max
  }, rows[0].transmission_datetime)

  await updateLastTransmission(maxDt)
  console.log(`Updated last_transmission_datetime to: ${maxDt}`)

  await geocodePending()
  console.log("Sync complete")
}

main().catch((err) => {
  console.error("Sync failed:", err)
  process.exit(1)
})
