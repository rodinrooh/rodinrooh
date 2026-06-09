// Build-time data pipeline for /waypoints ("Every Name in the Sky").
//
// Downloads the FAA 28-Day NASR Subscription (CSV format, free, no auth), pulls
// FIX_BASE.csv out of the zip, keeps the pronounceable named waypoints, and writes
// two compact static JSON files into /public:
//   - public/waypoints.json        the full searchable set (array-of-arrays)
//   - public/waypoints-weird.json  the curated + auto-found "funny" feed
//
// Run manually (re-run every ~28 days when a new NASR cycle ships, or whenever):
//   node scripts/build-waypoints-data.mjs
//
// The FAA data barely changes and the concept is timeless, so this is NOT part of the
// Vercel build — we commit the generated JSON to the repo, same as the payroll/muni data.
//
// If the download 404s, the cycle has rolled over: bump EFFECTIVE_DATE to the current
// effective date listed at
//   https://www.faa.gov/air_traffic/flight_info/aeronav/aero_data/NASR_Subscription/

import { writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import AdmZip from "adm-zip"
import { parse } from "csv-parse/sync"
import wordListPath from "word-list"
import { readFileSync } from "node:fs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = join(__dirname, "..", "public")

// ---- config ---------------------------------------------------------------
// FAA NASR 28-day cycle effective date (YYYY-MM-DD). Bump when the cycle rolls.
// The FIX-only CSV zip is named like "14_May_2026_FIX_CSV.zip" (DD_Mon_YYYY).
const EFFECTIVE_DATE = "2026-05-14"
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const [Y, M, D] = EFFECTIVE_DATE.split("-").map(Number)
const ZIP_URL = `https://nfdc.faa.gov/webContent/28DaySub/extra/${String(D).padStart(2, "0")}_${MONTHS[M - 1]}_${Y}_FIX_CSV.zip`

// Curated highlights — chosen for documented aviation lore or obvious charm. Captions are
// ours and deliberately make NO geographic claims (the map shows the real spot); we only
// assert things that are true of the name itself. Filtered to whatever exists in the data.
const CURATED = [
  { id: "ITAWT", caption: "“I tawt I taw…” — air traffic controllers really named fixes after Tweety Bird." },
  { id: "IDEED", caption: "“…I did!” — the punchline, sitting in the sky as a real waypoint." },
  { id: "BURGR", caption: "BURGR. The FAA put a hamburger on the aeronautical charts." },
  { id: "SPICY", caption: "SPICY. A real intersection you can file a flight plan through." },
  { id: "PRTZL", caption: "Pretzel, with the vowels taken out, the way fixes are." },
  { id: "DEZRT", caption: "DEZRT. Phonetically a desert, officially a navigation fix." },
  { id: "BOORD", caption: "BOORD — bored, in five-letter flight-plan spelling." },
  { id: "JAYME", caption: "Somebody named JAYME is, technically, forever in the sky." },
  { id: "VODKA", caption: "VODKA. Cleared direct." },
  { id: "TACOS", caption: "TACOS, hanging somewhere over America." },
  { id: "BACON", caption: "BACON. Filed and flown daily." },
  { id: "PUPPY", caption: "PUPPY, a good waypoint." },
]

// ---- fetch + unzip ---------------------------------------------------------
async function downloadFixCsv() {
  console.log(`Downloading FAA NASR CSV: ${ZIP_URL}`)
  const res = await fetch(ZIP_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (waypoints build script)" },
  })
  if (!res.ok) {
    throw new Error(
      `Download failed ${res.status} ${res.statusText}. ` +
        `The 28-day cycle may have rolled over — update EFFECTIVE_DATE.`,
    )
  }
  const buf = Buffer.from(await res.arrayBuffer())
  console.log(`  got ${(buf.length / 1e6).toFixed(1)} MB zip`)

  const zip = new AdmZip(buf)
  const entry = zip
    .getEntries()
    .find((e) => /(^|\/)FIX_BASE\.csv$/i.test(e.entryName))
  if (!entry) {
    const names = zip.getEntries().map((e) => e.entryName)
    throw new Error(`FIX_BASE.csv not found in zip. Entries: ${names.slice(0, 40).join(", ")}…`)
  }
  console.log(`  extracting ${entry.entryName}`)
  return entry.getData().toString("utf8")
}

// ---- main ------------------------------------------------------------------
const csv = await downloadFixCsv()

// Parse with headers — column order has changed across NASR releases, so go by name.
const records = parse(csv, { columns: true, skip_empty_lines: true, relax_column_count: true })
console.log(`Parsed ${records.length} FIX_BASE rows`)

// Resolve column names case-insensitively against the header row.
const sample = records[0] || {}
const findCol = (...candidates) => {
  const keys = Object.keys(sample)
  for (const c of candidates) {
    const hit = keys.find((k) => k.toUpperCase() === c.toUpperCase())
    if (hit) return hit
  }
  return null
}
const COL_ID = findCol("FIX_ID")
const COL_LAT = findCol("LAT_DECIMAL")
const COL_LON = findCol("LONG_DECIMAL")
const COL_ST = findCol("STATE_CODE")
if (!COL_ID || !COL_LAT || !COL_LON) {
  throw new Error(`Could not resolve required columns. Headers: ${Object.keys(sample).join(", ")}`)
}

// Keep pronounceable named waypoints: 3–5 letters, A–Z only. Dedupe by id+rounded coords.
const NAME_RE = /^[A-Z]{3,5}$/
const seen = new Set()
const points = []
for (const r of records) {
  const id = (r[COL_ID] || "").trim().toUpperCase()
  if (!NAME_RE.test(id)) continue
  const lat = parseFloat(r[COL_LAT])
  const lon = parseFloat(r[COL_LON])
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
  // FAA decimal columns are signed degrees; sanity-bound to the planet.
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue
  const key = `${id}|${lat.toFixed(4)}|${lon.toFixed(4)}`
  if (seen.has(key)) continue
  seen.add(key)
  points.push({
    id,
    lat: Math.round(lat * 1e4) / 1e4,
    lon: Math.round(lon * 1e4) / 1e4,
    st: (COL_ST ? r[COL_ST] : "") || "",
  })
}
console.log(`Kept ${points.length} named waypoints`)

// Pick a representative point per id for lookups (first occurrence is fine).
const byId = new Map()
for (const p of points) if (!byId.has(p.id)) byId.set(p.id, p)

// ---- compact searchable file -----------------------------------------------
const dataFile = {
  effectiveDate: EFFECTIVE_DATE,
  columns: ["id", "lat", "lon", "st"],
  rows: points.map((p) => [p.id, p.lat, p.lon, p.st]),
}

// ---- weird feed ------------------------------------------------------------
// Real English 5-letter words that happen to be real waypoints — surfaced automatically.
const words5 = new Set(
  readFileSync(wordListPath, "utf8")
    .split("\n")
    .filter((w) => w.length === 5 && /^[a-z]+$/.test(w))
    .map((w) => w.toUpperCase()),
)
const wordHits = []
const wordSeen = new Set()
for (const p of points) {
  if (p.id.length === 5 && words5.has(p.id) && !wordSeen.has(p.id)) {
    wordSeen.add(p.id)
    wordHits.push(p)
  }
}
wordHits.sort((a, b) => a.id.localeCompare(b.id))

const curated = CURATED.filter((c) => byId.has(c.id)).map((c) => ({
  ...byId.get(c.id),
  caption: c.caption,
}))
const missingCurated = CURATED.filter((c) => !byId.has(c.id)).map((c) => c.id)

const weirdFile = {
  effectiveDate: EFFECTIVE_DATE,
  curated,
  words: wordHits.map((p) => [p.id, p.lat, p.lon, p.st]),
}

// ---- write -----------------------------------------------------------------
const dataPath = join(PUBLIC_DIR, "waypoints.json")
const weirdPath = join(PUBLIC_DIR, "waypoints-weird.json")
writeFileSync(dataPath, JSON.stringify(dataFile))
writeFileSync(weirdPath, JSON.stringify(weirdFile))

const mb = (p) => (Buffer.byteLength(JSON.stringify(p)) / 1e6).toFixed(2)
console.log("\n=== SUMMARY ===")
console.log(`effectiveDate   : ${EFFECTIVE_DATE}`)
console.log(`named waypoints : ${points.length} (${byId.size} unique ids)`)
console.log(`real-word names : ${wordHits.length}`)
console.log(`curated present : ${curated.length}/${CURATED.length}`)
if (missingCurated.length) console.log(`curated missing : ${missingCurated.join(", ")}`)
for (const id of ["BURGR", "WHODA", "ITAWT"]) {
  const p = byId.get(id)
  console.log(`  ${id.padEnd(6)}: ${p ? `${p.lat}, ${p.lon} (${p.st})` : "NOT FOUND"}`)
}
console.log(`waypoints.json       : ${mb(dataFile)} MB`)
console.log(`waypoints-weird.json : ${mb(weirdFile)} MB`)
console.log(`\nWrote ${dataPath}\nWrote ${weirdPath}`)
