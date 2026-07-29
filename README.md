# Location Timeline

Ask natural-language questions about your own GPS history — "where was I
last Tuesday?", "what route did I take 7 months ago on the 12th?" — and get
back a map, a route, and a sortable table of stops, powered by Claude.

## Architecture

```
OwnTracks (phone app)
   │  HTTP POST, Basic Auth
   ▼
Supabase Edge Function  (owntracks-ingest)
   │  reshapes payload, inserts row
   ▼
Supabase Postgres + PostGIS  (location_pings table)
   │
   ▼
Next.js API route  (/api/query)
   │  1. Claude parses "7 months ago" -> concrete date range
   │  2. Query Supabase for pings in that range
   │  3. Cluster pings into "stops", simplify route (Douglas-Peucker)
   │  4. Reverse-geocode stops (Nominatim, free)
   │  5. Claude summarizes the period in plain English
   ▼
React frontend  (map + table, cross-filtered)
```

This repo is the last piece of that pipeline: the Next.js app that turns a
question into a map + table. It expects the Supabase project, PostGIS
table, and OwnTracks ingest Edge Function to already exist (see "Prerequisites"
below) — this is the same pattern used in the financial-transactions
dashboard, applied to GPS pings instead of bank transactions.

## Prerequisites

You should already have, from earlier setup:

1. A Supabase project with PostGIS enabled and a `location_pings` table:
   ```sql
   create extension if not exists postgis;

   create table public.location_pings (
     id bigint generated always as identity primary key,
     tid text,
     tst timestamptz not null,
     lat double precision not null,
     lon double precision not null,
     geom geometry(Point, 4326) generated always as (
       ST_SetSRID(ST_MakePoint(lon, lat), 4326)
     ) stored,
     alt double precision,
     acc double precision,
     vac double precision,
     vel double precision,
     cog double precision,
     batt double precision,
     conn text,
     bs smallint,
     topic text,
     raw jsonb not null,
     created_at timestamptz not null default now()
   );

   create index idx_location_pings_tst on public.location_pings (tst desc);
   create index idx_location_pings_geom on public.location_pings using gist (geom);
   create unique index idx_location_pings_dedup on public.location_pings (tid, tst);
   ```
2. A Supabase Edge Function (`owntracks-ingest`) that receives OwnTracks'
   HTTP-mode payload (Basic Auth) and inserts rows into `location_pings`.
3. OwnTracks configured on your phone (HTTP mode, pointed at that Edge
   Function) and actively logging pings.
4. An Anthropic API key.

If any of that isn't set up yet, get it running first — this app only reads
from `location_pings`, it doesn't create the ingest pipeline.

## Local setup

```bash
git clone <this-repo>
cd location-timeline
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

| Variable | Where to find it |
|---|---|
| `ANTHROPIC_API_KEY` | Your existing Anthropic API key |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard → Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Settings → API → `service_role` secret key |
| `ANTHROPIC_MODEL` | Optional, defaults to `claude-sonnet-4-6` |
| `SITE_PIN` | Any digit string you choose — required to access the app |
| `SESSION_SECRET` | Random string signing the session cookie. Generate with `openssl rand -hex 32` |

**`SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security** — it's what lets
the server read all of `location_pings` regardless of RLS policies. It must
never be exposed to the browser; that's why it's not prefixed
`NEXT_PUBLIC_`, and it's only ever read inside `lib/supabase.ts`, which is
imported exclusively by server-side API routes.

```bash
npm run dev
```

Visit `http://localhost:3000`. Try `http://localhost:3000/api/health` first
to confirm env vars and DB connectivity are all green before testing queries.

## How a query flows through the app

1. **`components/QueryBox.tsx`** — user types a question, POSTs to `/api/query`.
2. **`app/api/query/route.ts`** — the orchestrator:
   - `lib/anthropic.ts :: parseDateRangeFromQuestion` — Claude turns the
     question into `{start, end}` dates, anchored to the server's real
     current date (never trusts the model's own idea of "today").
   - `lib/supabase.ts :: fetchPingsInRange` — pulls raw pings for that
     range (capped at 20,000 rows as a safety valve).
   - `lib/simplify.ts :: clusterIntoStops` — groups pings that stay within
     ~120m of each other for 8+ minutes into "stops"; everything else is
     the in-transit route.
   - `lib/simplify.ts :: simplifyRoute` — Douglas-Peucker simplification
     on the transit polyline so we're not shipping thousands of
     near-duplicate points to the client or to Claude.
   - `lib/simplify.ts :: reverseGeocodeStops` — free Nominatim reverse
     geocoding for stop place names (skipped if there are >15 stops, to
     stay within Nominatim's 1 req/sec free-tier policy).
   - `lib/anthropic.ts :: summarizeStops` — Claude writes a short
     natural-language summary of the period from the stop data.
3. **`app/page.tsx`** — renders the summary, then the map (`MapView.tsx`,
   Leaflet + OpenStreetMap tiles, no API key needed) and table
   (`RouteTable.tsx`, TanStack Table) side by side. Clicking a table row
   selects the corresponding map marker and vice versa.

## Deploying to Vercel

```bash
npm install -g vercel   # if you don't have it
vercel login
vercel
```

Or via the Vercel dashboard: **New Project → Import this repo**.

Either way, set the same three environment variables from `.env.local` in
**Project Settings → Environment Variables** on Vercel — they won't be
picked up from `.env.local` automatically since that file is gitignored.

After deploying, hit `https://<your-app>.vercel.app/api/health` to confirm
the deployed environment can reach Supabase before testing real queries.

## Access control (PIN gate)

Since this app exposes real location history over a public URL, every route —
pages *and* API endpoints — is gated behind a 6-digit PIN, enforced in
`middleware.ts`:

- `/login` — PIN entry screen, the only page reachable without a session
- `/api/auth/login` — the only API route reachable without a session;
  verifies the PIN against `SITE_PIN` and issues a signed, `httpOnly` session
  cookie valid for 30 days
- Everything else — any other page, and critically `/api/query` itself —
  returns a redirect (pages) or a 401 (API calls) without a valid cookie

This matters because a PIN check done only in the browser wouldn't actually
protect anything — someone could call `/api/query` directly and bypass a
UI-only gate entirely. The middleware runs server-side on every request
before your code does, so there's no path around it.

The session token is a signed `expiry.hmac` pair (`lib/auth.ts`), verified
with the Web Crypto API rather than Node's `crypto` module, because
Next.js middleware runs on Vercel's Edge runtime, which doesn't have
Node's `crypto` available.

## Timeline scrubber

Below the map, a play/scrub control lets you replay a queried day: drag the
slider (or hit play) and a marker animates along your actual route,
interpolated between real GPS points (`lib/interpolate.ts`) rather than
jumping point to point. Green ticks on the scrubber track mark where stops
occurred.

This is entirely client-side — it replays the `route` and `stops` arrays
already returned by the single `/api/query` call for that question. No
additional Supabase or Claude calls happen while scrubbing; it's just
animating over data already sitting in React state. Scrubbing into a date
range outside what was originally queried isn't supported — that would need
a fresh query.

## Known limitations / next steps

- **Reverse geocoding is sequential and rate-limited to 1 req/sec** — fine
  for a handful of stops, slow for a query spanning many stops. Swap in a
  paid geocoder (Mapbox, Google) if you need speed at scale.
- **No auth on the app itself** — anyone with the URL can query your
  location history. **Update: this is now handled** — see "Access control"
  above. The PIN is a single shared secret (fine for personal use by one
  person); it's not per-user accounts, rate-limited, or lockout-protected
  against repeated guesses, so treat it like a door key, not a bank login.
- **Stop-clustering thresholds are fixed** (120m radius, 8min minimum) in
  `lib/simplify.ts` — tune `STOP_RADIUS_METERS` / `MIN_STOP_MINUTES` if
  your commute pattern needs different sensitivity.
- **No caching** — every query re-hits Supabase, Nominatim, and Claude
  twice (date parse + summary). Fine for personal use; add a cache layer
  if query volume grows.
