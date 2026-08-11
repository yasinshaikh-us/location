-- place_cache.place_name is written via cache_place(), a `security invoker`
-- RPC granted to `authenticated` with an INSERT policy of `with check (true)`
-- (intentional -- see the table's own comments, this cache isn't per-user
-- data). That also means any signed-in user can call the RPC directly
-- (not just through lib/geocode.ts's app flow) with an arbitrary,
-- unbounded-length place_name at an arbitrary coordinate. That text later
-- flows, unmodified, into another user's summarizeStops() Claude prompt
-- (lib/anthropic.ts) as a stop's "place" field. A companion change adds an
-- explicit untrusted-data instruction to that prompt covering "place"; this
-- migration adds a defense-in-depth bound at the data layer so a single
-- write can't inflate that prompt with an arbitrarily large payload.
-- 100 chars comfortably covers any real place name Mapbox/geocoding
-- providers return (neighborhood/locality/place-level names).
--
-- Applied directly to the live project (ognpwwurjipokrqwcmpk) via the
-- Supabase MCP `apply_migration` tool; this file mirrors that change for
-- version-control history and local/CLI parity, matching the convention
-- established in 20260801021000_create_place_cache.sql.

alter table public.place_cache
  add constraint place_cache_place_name_length check (char_length(place_name) <= 100);
