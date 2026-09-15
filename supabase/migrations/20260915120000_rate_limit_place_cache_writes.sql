-- cache_place() is `security invoker`, granted to `authenticated`, with
-- nothing bounding how many rows a single signed-in user can insert. Unlike
-- /api/query (see 20260818000000_add_query_rate_limit.sql), which added a
-- DB-enforced counter specifically because PostgREST callers can reach the
-- RPC directly and bypass any app-level throttling, cache_place had no such
-- backstop: lib/geocode.ts only ever calls it a few times per request (its
-- own MAX_NEW_LOCATIONS_PER_REQUEST=40 cap, one write per ~100ms), but a
-- caller hitting rpc/cache_place directly is bound by none of that.
--
-- Combined with place_cache's intentionally open `with check (true)` INSERT
-- policy (see 20260801021000_create_place_cache.sql) and the 100-char cap
-- (20260811160000), this meant a single account could still write an
-- unbounded *number* of adversarial entries, at unbounded coordinates --
-- each individually capped and each already treated as untrusted by
-- summarizeStops' prompt, but with no limit on how much of the shared,
-- cross-user cache one account could plant. This adds the same per-user
-- sliding-window counter used for /api/query, sized well above any real
-- usage (400 writes / 5 min, vs. a legitimate worst case around 40 new
-- places per query * 20 queries/5min = 800 only if every single query
-- touched 40 places nobody has ever queried before anywhere -- in practice
-- far lower once the shared cache has any coverage at all) so it only ever
-- bites a scripted write campaign, not real usage.
--
-- cache_place() moves from `security invoker`/`language sql` to `security
-- definer`/`language plpgsql` to enforce this: place_cache_write_limits
-- (like query_rate_limits) has no client-facing policies, so only a
-- definer function can touch it. The insert into place_cache itself is
-- unaffected -- table-owner privileges already bypass its RLS policies (it
-- isn't FORCE ROW LEVEL SECURITY), so a definer function inserts exactly as
-- an invoker function did. The function's parameter signature is left
-- unchanged (no new arguments) so this is a true CREATE OR REPLACE of the
-- existing function, not a second overload left callable without the
-- limit.
--
-- Applied directly to the live project (ognpwwurjipokrqwcmpk) via the
-- Supabase MCP `apply_migration` tool, in two steps live: the initial
-- create left `anon` still able to execute cache_place per
-- has_function_privilege() -- same platform quirk noted in
-- 20260818000000_add_query_rate_limit.sql, now more consequential since
-- the function is `security definer` -- so a second, separate
-- apply_migration call re-issuing just the revoke was needed to make it
-- stick. This file reflects the final corrected state directly; this
-- mirrors that change for version-control history and local/CLI parity.

create table public.place_cache_write_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null default now(),
  count integer not null default 0
);

comment on table public.place_cache_write_limits is
  'Per-user sliding-window counter for cache_place() writes -- see cache_place().';

alter table public.place_cache_write_limits enable row level security;

-- No policy grants SELECT/INSERT/UPDATE directly -- all access goes
-- through cache_place() below, same pattern as query_rate_limits.

create or replace function public.cache_place(
  p_lon double precision,
  p_lat double precision,
  p_place_name text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_max_writes constant integer := 400;
  v_window constant interval := interval '300 seconds';
  v_window_start timestamptz;
  v_count integer;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  insert into public.place_cache_write_limits (user_id, window_start, count)
  values (v_user_id, v_now, 1)
  on conflict (user_id) do update
    set window_start = case
          when public.place_cache_write_limits.window_start <= v_now - v_window
          then v_now
          else public.place_cache_write_limits.window_start
        end,
        count = case
          when public.place_cache_write_limits.window_start <= v_now - v_window
          then 1
          else public.place_cache_write_limits.count + 1
        end
  returning public.place_cache_write_limits.window_start, public.place_cache_write_limits.count
  into v_window_start, v_count;

  if v_count > v_max_writes then
    raise exception 'place cache write rate limit exceeded, retry after %', v_window_start + v_window;
  end if;

  insert into public.place_cache (location, place_name)
  values (st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography, p_place_name);
end;
$$;

revoke execute on function public.cache_place(double precision, double precision, text) from public;
revoke execute on function public.cache_place(double precision, double precision, text) from anon;
grant execute on function public.cache_place(double precision, double precision, text) to authenticated;
