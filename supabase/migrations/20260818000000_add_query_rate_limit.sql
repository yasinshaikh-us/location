-- /api/query calls Claude twice per request (parseDateRangeFromQuestion,
-- summarizeStops), billed to this app's Anthropic API key, with nothing
-- capping how often a signed-in user can hit that route -- any Google
-- account that's signed in (see README) can drive unbounded Anthropic
-- spend. This adds a small per-user sliding-window counter, enforced in
-- the database so it can't be bypassed by calling PostgREST directly
-- instead of going through the route.
--
-- One row per user, reset whenever the window has elapsed. SECURITY
-- DEFINER (this table has no client-facing policies -- the function is
-- the only sanctioned access path) but scoped internally to auth.uid(),
-- same pattern used for place_cache's functions: a caller can only ever
-- touch their own row, never target another user's.
--
-- Applied directly to the live project (ognpwwurjipokrqwcmpk) via the
-- Supabase MCP `apply_migration` tool, in two steps live: the initial
-- create (including this file's own inline revoke/grant) left `anon`
-- still able to execute the function per has_function_privilege() --
-- the platform re-applies its default anon/authenticated grants on a
-- newly created function after a migration completes, silently undoing
-- an inline revoke in the same migration -- so a second, separate
-- apply_migration call re-issuing just the revoke was needed to make it
-- stick. This file reflects the final corrected state directly; this
-- mirrors that change for version-control history and local/CLI parity,
-- matching the convention established in
-- 20260801021000_create_place_cache.sql.

create table public.query_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null default now(),
  count integer not null default 0
);

comment on table public.query_rate_limits is
  'Per-user sliding-window counter for /api/query''s Claude calls -- see check_and_increment_query_rate_limit().';

alter table public.query_rate_limits enable row level security;

-- No policy grants SELECT/INSERT/UPDATE directly -- all access goes
-- through check_and_increment_query_rate_limit() below.

create or replace function public.check_and_increment_query_rate_limit(
  p_max_requests integer default 20,
  p_window_seconds integer default 300
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_window_start timestamptz;
  v_count integer;
  v_now timestamptz := now();
  v_window interval := make_interval(secs => p_window_seconds);
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  insert into public.query_rate_limits (user_id, window_start, count)
  values (v_user_id, v_now, 1)
  on conflict (user_id) do update
    set window_start = case
          when public.query_rate_limits.window_start <= v_now - v_window
          then v_now
          else public.query_rate_limits.window_start
        end,
        count = case
          when public.query_rate_limits.window_start <= v_now - v_window
          then 1
          else public.query_rate_limits.count + 1
        end
  returning public.query_rate_limits.window_start, public.query_rate_limits.count
  into v_window_start, v_count;

  if v_count > p_max_requests then
    return query select false, greatest(0, ceil(extract(epoch from (v_window_start + v_window - v_now)))::integer);
  else
    return query select true, 0;
  end if;
end;
$$;

revoke execute on function public.check_and_increment_query_rate_limit(integer, integer) from public;
grant execute on function public.check_and_increment_query_rate_limit(integer, integer) to authenticated;
