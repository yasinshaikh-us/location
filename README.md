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
| `ANTHROPIC_MODEL` | Optional, defaults to `claude-sonnet-4-6` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase dashboard → Settings → API → `anon`/publishable key |
| `MAPBOX_TOKEN` | A Mapbox access token — [account.mapbox.com](https://account.mapbox.com/) → Tokens |

Google also needs to be enabled as a sign-in provider on the Supabase project
itself (Authentication → Providers → Google, with a Client ID/Secret from a
Google Cloud OAuth client whose authorized redirect URI is
`<NEXT_PUBLIC_SUPABASE_URL>/auth/v1/callback`) — that's a one-time dashboard
step, not something in this repo's env vars.

There is no service-role key anywhere in this app. Every Supabase query goes
through a request-scoped client bound to the signed-in user's own session
(`lib/supabase-server.ts`), so `location_pings`' `auth.uid() = user_id` RLS
policy is what restricts each request — nothing here needs, or should have,
elevated access. `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY` are safe to expose to
the browser by design, which is why they're the only Supabase vars this app
needs.

**`MAPBOX_TOKEN` is the one exception to the `NEXT_PUBLIC_` convention** —
`MapView.tsx` runs entirely in the browser, so the map needs the token
client-side. Rather than renaming it, `next.config.js` inlines it into the
client bundle under its original name via Next's `env` config key.

```bash
npm run dev
```

Visit `http://localhost:3000`. Try `http://localhost:3000/api/health` first
to confirm env vars are all green before testing queries.

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
   Mapbox GL JS, requires `MAPBOX_TOKEN`) and table
   (`RouteTable.tsx`, TanStack Table) side by side. Clicking a table row
   selects the corresponding map marker and vice versa.

## Deploying to Vercel

```bash
npm install -g vercel   # if you don't have it
vercel login
vercel
```

Or via the Vercel dashboard: **New Project → Import this repo**.

Either way, set the same environment variables from `.env.local` in
**Project Settings → Environment Variables** on Vercel — they won't be
picked up from `.env.local` automatically since that file is gitignored.

After deploying, hit `https://<your-app>.vercel.app/api/health` to confirm
the deployed environment has every required env var set before testing
real queries.

## Access control (Google sign-in + per-user RLS)

Since this app exposes real location history over a public URL, every route —
pages *and* API endpoints — is gated behind a signed-in Supabase Auth session,
enforced in `middleware.ts`:

- `/login` — the sign-in screen ("Continue with Google"), the only page
  reachable without a session
- `/auth/callback` — where Google redirects back to after consent; exchanges
  the OAuth code for a session and sets the auth cookies
- `/api/health` — also reachable without a session (so a broken login is
  still diagnosable), and only ever reports whether each env var is `set`
  or `MISSING`, never a value
- Everything else — any other page, and critically `/api/query` itself —
  returns a redirect (pages) or a 401 (API calls) without a valid session

This matters because a check done only in the browser wouldn't actually
protect anything — someone could call `/api/query` directly and bypass a
UI-only gate entirely. The middleware runs server-side on every request
before your code does, so there's no path around it.

Anyone with a Google account can sign in — access to *data* is what's
actually restricted, not the ability to create an account. `location_pings`
has a `user_id` column and an `auth.uid() = user_id` Row Level Security
policy, so `lib/supabase.ts :: fetchPingsInRange` runs through a
session-bound Supabase client (`lib/supabase-server.ts`, using the
`anon` key, not the service-role key) — Postgres itself restricts every
query to the signed-in user's own rows. A new sign-in starts with zero
rows until pings are written with their `user_id`.

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

## Running tests

```bash
npm test          # unit tests (Vitest) — pure logic + lib/ boundaries + API routes + middleware
npm run test:e2e  # one end-to-end smoke test (Playwright), mocked /api/query, no real credentials needed
```

`npm test` is fast (no browser) and covers `lib/format.ts`, `lib/interpolate.ts`,
`lib/simplify.ts` (stop clustering, route simplification, reverse geocoding),
and `lib/auth.ts` directly; `lib/supabase.ts` and `lib/anthropic.ts` with their
respective clients mocked at the module boundary; and every `app/api/*/route.ts`
handler and `middleware.ts` with their `lib/` collaborators mocked so each
layer is tested against its own contract. `npm run test:e2e` builds the app,
serves it locally, and drives it in a real browser: it logs in for real
through `/api/auth/login` (exercising `middleware.ts`/`lib/auth.ts`
end-to-end), then mocks `/api/query` at the network layer to check that a
query renders a summary, a map, and a stops table, and that logout redirects
back to `/login`.

Both run in CI (`.github/workflows/ci.yml`) on every push/PR, gated in order:
build → unit tests → smoke test, so a broken build or a fast unit-test
failure surfaces before the slower browser test ever runs.

## Known limitations / next steps

- **Reverse geocoding is sequential and rate-limited to 1 req/sec** — fine
  for a handful of stops, slow for a query spanning many stops. Swap in a
  paid geocoder (Mapbox, Google) if you need speed at scale.
- **No auth on the app itself** — anyone with the URL can query your
  location history. **Update: this is now handled** — see "Access control"
  above. The PIN is a single shared secret (fine for personal use by one
  person), not per-user accounts. Repeated wrong guesses from the same IP
  are throttled (8 attempts per 5-minute window, `lib/auth.ts`) — an
  in-memory, per-isolate guard, same caveat as the scorecard app's: it
  resets on cold start and isn't shared across regions, so treat it as a
  deterrent against naive scripts, not a hard limit.
- **Stop-clustering thresholds are fixed** (120m radius, 8min minimum) in
  `lib/simplify.ts` — tune `STOP_RADIUS_METERS` / `MIN_STOP_MINUTES` if
  your commute pattern needs different sensitivity.
- **No caching** — every query re-hits Supabase, Nominatim, and Claude
  twice (date parse + summary). Fine for personal use; add a cache layer
  if query volume grows.
