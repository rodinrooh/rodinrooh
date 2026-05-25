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
