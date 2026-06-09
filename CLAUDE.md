# rodinrooh.com — personal site monorepo

Deployed at `rodinrooh.com`. Push to main → Vercel auto-deploys.
Vercel project: `rodinrooh` (rodins-projects-97c1647b)

## Routes

| Route | Source | Description |
|-------|--------|-------------|
| `/` | `app/page.tsx` | Barebones landing page |
| `/sf-towing` | `app/sf-towing/` | SF tow tracker (Apple MapKit, frozen dataset) |
| `/internet-airport` | `app/internet-airport/` | Live domain arrivals board |
| `/sf-meters` | `app/sf-meters/` | Live SF parking meter revenue tracker (Apple MapKit, DataSF, Supabase realtime) |
| `/sf-muni` | `app/sf-muni/` | Live Muni bus latency map (Apple MapKit, 511 GTFS-RT, no storage) |
| `/sf-craigslist` | `app/sf-craigslist/` | Freelist — SF Bay craigslist free section feed (no storage) |
| `/waypoints` | `app/waypoints/` | Every Name in the Sky — search FAA named waypoints, Apple MapKit satellite map (static JSON, no storage) |

## Environment variables (set in Vercel project)

| Variable | Used by |
|----------|---------|
| `NEXT_PUBLIC_TOWING_SUPABASE_URL` | sf-towing |
| `NEXT_PUBLIC_TOWING_SUPABASE_ANON_KEY` | sf-towing |
| `NEXT_PUBLIC_AIRPORT_SUPABASE_URL` | internet-airport |
| `NEXT_PUBLIC_AIRPORT_SUPABASE_ANON_KEY` | internet-airport |
| `APPLE_MAPS_TEAM_ID` | sf-towing + sf-meters map token API |
| `APPLE_MAPS_KEY_ID` | sf-towing + sf-meters map token API |
| `APPLE_MAPS_PRIVATE_KEY` | sf-towing + sf-meters map token API |
| `NEXT_PUBLIC_METERS_SUPABASE_URL` | sf-meters |
| `NEXT_PUBLIC_METERS_SUPABASE_ANON_KEY` | sf-meters |
| `API_511_KEYS` | sf-muni (511 SF Bay token(s), comma-separated, server-only) |

## Key files

- `lib/supabase.ts` — lazy Supabase client for sf-towing
- `lib/supabase-airport.ts` — lazy Supabase client for internet-airport
- `lib/types.ts`, `lib/useTows.ts`, `lib/colorMap.ts` — sf-towing data layer
- `app/sf-towing/api/maps-token/route.ts` — Apple MapKit JWT endpoint
- `lib/mapkit.d.ts` — TypeScript ambient types for window.mapkit

## Where the data comes from

- **sf-towing**: Supabase `tows` table, scraper in `rodinrooh/findmycar` repo (GitHub Actions, currently broken — Autura firewalled the source). Dataset is frozen as of May 12, 2026.
- **internet-airport**: Supabase `domains` table, scraper + reveal workflow in `rodinrooh/domains.today` repo (still active).
- **sf-meters**: Supabase `sf_meter_transactions` table. GitHub Actions cron (`.github/workflows/sf-meters-sync.yml`) runs every 5 min, pulls from DataSF API (`data.sfgov.org/resource/imvp-dq3v.json`), geocodes via Mapbox. GitHub Actions secrets needed: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `MAPBOX_TOKEN`, `DATASF_APP_TOKEN` (optional).
- **sf-craigslist**: No storage. Server component fetches Craigslist's internal search API (`sapi.craigslist.org/web/v8/postings/search/full?...&searchPath=zip` — the RSS feed was discontinued in 2020), cached 5 min via `next: { revalidate: 300 }`, decodes the compact item arrays against the response's `decode` table, renders the grid server-side. Images hotlinked from `images.craigslist.org`. Note: craigslist may block datacenter IPs; if the page shows "Feed unavailable" the upstream fetch is being 403'd.
- **waypoints**: No storage, no env vars, no runtime API. `scripts/build-waypoints-data.mjs` (run manually, like the payroll script) downloads the FAA 28-Day NASR Subscription FIX CSV (free, no auth: `https://nfdc.faa.gov/webContent/28DaySub/extra/<DD>_<Mon>_<YYYY>_FIX_CSV.zip`), unzips `FIX_BASE.csv` with `adm-zip`, parses with `csv-parse`, keeps 3–5-letter alpha `FIX_ID`s with their decimal lat/lon, and writes `public/waypoints.json` (full searchable set, ~2.2 MB) + `public/waypoints-weird.json` (curated highlights + auto-detected real-word names via `word-list`). Bump `EFFECTIVE_DATE` in the script when the 28-day cycle rolls. Data is fetched static from `/public`; the map is Apple MapKit JS in **Hybrid** (satellite) mode, authorized by `app/waypoints/api/maps-token/route.ts` (reuses the shared `APPLE_MAPS_*` env vars).
- **sf-muni**: No storage. `app/sf-muni/api/buses/route.ts` fetches the 511 SF Bay GTFS-RT VehiclePositions + TripUpdates feeds (agency `SF`), parses the protobuf with `gtfs-realtime-bindings`, joins position+delay, returns a compact JSON array. The upstream fetch and the response are both cached for the refresh window so 511 is hit at most once per window regardless of traffic (511 limit: 60 req/hr per key). Client polls the cached route and computes the stats. Needs `API_511_KEYS`.

## How to deploy

```bash
git add -A
git commit -m "your message"
git push   # Vercel deploys automatically
```

To force a redeploy without a code change:
```bash
vercel --prod
```

## Local dev

```bash
npm install
# copy .env.local.example → .env.local and fill in values
npm run dev   # runs on localhost:3000
```
