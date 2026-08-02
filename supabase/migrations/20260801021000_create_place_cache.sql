-- A shared, cross-user cache of reverse-geocoded place names, keyed by
-- location rather than by user -- a place name ("Capitol Hill") is a
-- fact about the world, not something that needs to be looked up fresh
-- per user or per query. Every user's queries check and contribute to
-- this same cache, so the marginal cost of resolving a given real-world
-- location trends toward zero as the cache fills up, and the app's
-- geocoding-provider rate limit is shared across the whole userbase
-- rather than paid per request. See lib/geocode.ts.
--
-- Uses PostGIS (already enabled on this project -- see
-- location_pings.geom) for a true distance-based nearest-match lookup
-- rather than fixed-precision coordinate rounding, so it doesn't
-- accumulate near-duplicate rows for the same real place the way a
-- simple lat/lon-rounding cache key would at the boundaries between
-- rounding buckets.
--
-- Applied directly to the live project (ognpwwurjipokrqwcmpk) via the
-- Supabase MCP `apply_migration` tool (in two steps live -- the initial
-- create, then a follow-up pinning each function's search_path after
-- the advisor flagged it -- this file reflects the final corrected
-- state directly); this file mirrors that change for version-control
-- history and local/CLI parity, matching the convention established in
-- 20260730231500_add_user_id_and_rls_to_location_pings.sql.

create table public.place_cache (
  id bigint generated always as identity primary key,
  location geography(point, 4326) not null,
  place_name text not null,
  created_at timestamptz not null default now()
);

comment on table public.place_cache is
  'Shared reverse-geocoding cache, keyed by location not by user -- see lib/geocode.ts.';

create index place_cache_location_idx
  on public.place_cache using gist (location);

alter table public.place_cache enable row level security;

-- Not per-user data: any authenticated user (the only ones who ever
-- reach the /api/query code path that touches this table -- see
-- proxy.ts) can read the whole shared cache and contribute new
-- entries to it. There's no owner column, since a cached place name
-- isn't "owned" by whoever happened to look it up first. (The Supabase
-- advisor flags this INSERT policy's `with check (true)` as overly
-- permissive by its generic heuristic -- that's intentional here, not
-- an oversight: this table holds no per-user or sensitive data.)
create policy "Authenticated users can read the shared place cache"
  on public.place_cache
  for select
  to authenticated
  using (true);

create policy "Authenticated users can contribute to the shared place cache"
  on public.place_cache
  for insert
  to authenticated
  with check (true);

-- Nearest cached place within p_max_meters, if any. Distance-based (not
-- a rounding-bucket match) so two very close real-world points -- e.g.
-- two visits to the same stop whose averaged coordinates differ by a
-- few meters of GPS jitter -- reliably match the same cache entry
-- regardless of exactly where they fall. search_path is pinned per the
-- Supabase advisor's function_search_path_mutable lint; PostGIS is
-- installed in the public schema on this project, so this doesn't
-- change behavior.
create or replace function public.nearest_cached_place(
  p_lon double precision,
  p_lat double precision,
  p_max_meters double precision default 120
)
returns table (place_name text)
language sql
security invoker
stable
set search_path = public, pg_temp
as $$
  select pc.place_name
  from public.place_cache pc
  where st_dwithin(
    pc.location,
    st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography,
    p_max_meters
  )
  order by pc.location <-> st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography
  limit 1;
$$;

create or replace function public.cache_place(
  p_lon double precision,
  p_lat double precision,
  p_place_name text
)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  insert into public.place_cache (location, place_name)
  values (st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography, p_place_name);
$$;

revoke execute on function public.nearest_cached_place(double precision, double precision, double precision) from public;
grant execute on function public.nearest_cached_place(double precision, double precision, double precision) to authenticated;

revoke execute on function public.cache_place(double precision, double precision, text) from public;
grant execute on function public.cache_place(double precision, double precision, text) to authenticated;
