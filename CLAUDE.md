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
| `/sf-traffic-cams` | `app/sf-traffic-cams/` | Live Caltrans traffic camera grid, SF Bay (D4) + LA (D7) toggle, HLS video w/ static-image fallback, no storage, no API key |
| `/sf-craigslist` | `app/sf-craigslist/` | Freelist — SF Bay craigslist free section feed (no storage) |
| `/waypoints` | `app/waypoints/` | Every Name in the Sky — full-screen MapLibre map with all 69k FAA waypoints as a GPU circle layer, searchable (static JSON, no storage) |

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
- **waypoints**: No storage, no env vars, no runtime API. `scripts/build-waypoints-data.mjs` (run manually, like the payroll script) downloads the FAA 28-Day NASR Subscription FIX CSV (free, no auth: `https://nfdc.faa.gov/webContent/28DaySub/extra/<DD>_<Mon>_<YYYY>_FIX_CSV.zip`), unzips `FIX_BASE.csv` with `adm-zip`, parses with `csv-parse`, keeps 3–5-letter alpha `FIX_ID`s with their decimal lat/lon, and writes four static files into `/public`: `waypoints.json` (full searchable set, ~2.2 MB), `waypoints-weird.json` (curated highlights + auto-detected real-word names via `word-list`), `waypoints-stats.json` (per-state counts / totals), and `us-states-10m.json` (us-atlas TopoJSON outline, downloaded at build). Bump `EFFECTIVE_DATE` in the script when the 28-day cycle rolls. The page (`app/waypoints/page.tsx`) is one full-screen map + a rounded centered search + a count bubble — no scroll sections, Inter font. The map (`app/waypoints/components/WaypointMap.tsx`) is **MapLibre GL** (`maplibre-gl`, free keyless OpenFreeMap "liberty" style) with all 69k waypoints as a single GeoJSON **circle layer** rendered on the GPU — fast, smooth, native hover/click hit-testing, `flyTo` + a highlight layer + popup on search. No API key, no env vars — 100% client-side static. (`waypoints-weird.json`/`waypoints-stats.json` are still emitted by the build but currently unused. The ~618 grid points in the Gulf with `STATE_CODE=OG` are the real FAA Gulf of Mexico offshore helicopter grid, not a bug. Earlier Apple MapKit attempts were dropped — MapKit JS has no way to render 69k points: a synced canvas/image overlay either hung the page or didn't render. MapLibre's GPU circle layer is the reliable way.)
- **sf-muni**: No storage. `app/sf-muni/api/buses/route.ts` fetches the 511 SF Bay GTFS-RT VehiclePositions + TripUpdates feeds (agency `SF`), parses the protobuf with `gtfs-realtime-bindings`, joins position+delay, returns a compact JSON array. The upstream fetch and the response are both cached for the refresh window so 511 is hit at most once per window regardless of traffic (511 limit: 60 req/hr per key). Client polls the cached route and computes the stats. Needs `API_511_KEYS`.
- **sf-traffic-cams**: No storage, no API key — Caltrans's CWWP2 camera feeds (`cctvStatusD04.json` for SF Bay, `cctvStatusD07.json` for LA) are public and keyless. `app/sf-traffic-cams/api/cameras/route.ts` fetches+caches only the small JSON *metadata* (camera name/location/URLs) server-side, 5-min `revalidate`/`s-maxage`. The actual video (HLS `.m3u8` + segments from `wzmedia.dot.ca.gov`) and fallback JPEGs (`cwwp2.dot.ca.gov`) are fetched **directly by the browser**, never proxied through our server — both carry `Access-Control-Allow-Origin: *` and need no auth/Referer (confirmed live), so our bandwidth cost stays near-zero regardless of visitor or concurrent-stream count. Each `CameraTile` lazy-attaches `hls.js` only while on-screen (IntersectionObserver) and falls back to the static JPG if the stream errors or hangs past an 8s watchdog — Caltrans streams don't always cleanly 404, some just hang, and not every camera in the feed is live at a given moment.

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
