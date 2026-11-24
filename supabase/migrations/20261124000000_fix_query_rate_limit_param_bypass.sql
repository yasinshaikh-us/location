-- check_and_increment_query_rate_limit(p_max_requests, p_window_seconds) took
-- its threshold and window as caller-supplied arguments. It's `security
-- definer`, granted EXECUTE to `authenticated`, which means PostgREST
-- exposes it directly as rest/v1/rpc/check_and_increment_query_rate_limit --
-- reachable by any signed-in user, not only through /api/query.
--
-- That let any authenticated user bypass the limiter entirely: call the RPC
-- directly with p_window_seconds=0 right before each real question.
-- p_window_seconds=0 makes the function treat its own window as already
-- elapsed, so it resets window_start=now(), count=1 on every such call --
-- then the next default-args call from /api/query sees a freshly-reset
-- count and always reports allowed=true. Verified directly against the
-- function as an authenticated user: 19 real-shaped calls, one direct call
-- with (999999, 0), and the window resets to count=1 -- unlimited billed
-- Anthropic calls (two per /api/query request), no admin access needed.
--
-- This is the exact bypass 20260915120000_rate_limit_place_cache_writes.sql
-- already fixed for cache_place() (by moving its own per-user limiter to
-- fixed, non-parameterized constants) -- this migration applies the same
-- fix here, which that migration's own comment flagged as the reason a
-- DB-enforced counter was needed in the first place, but the counter's own
-- threshold/window were left overridable.
--
-- Changing a Postgres function's parameter list isn't an in-place `create
-- or replace` -- the old two-arg overload has to be dropped explicitly or
-- it keeps existing (and keeps being callable) alongside the new one.

drop function if exists public.check_and_increment_query_rate_limit(integer, integer);

create function public.check_and_increment_query_rate_limit()
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Fixed, not caller-supplied -- see the migration comment above for why.
  c_max_requests constant integer := 20;
  c_window_seconds constant integer := 300;
  v_user_id uuid := auth.uid();
  v_window_start timestamptz;
  v_count integer;
  v_now timestamptz := now();
  v_window interval := make_interval(secs => c_window_seconds);
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

  if v_count > c_max_requests then
    return query select false, greatest(0, ceil(extract(epoch from (v_window_start + v_window - v_now)))::integer);
  else
    return query select true, 0;
  end if;
end;
$$;

-- Same lockdown as the original migration, plus the explicit anon revoke
-- that migration's own comment notes the platform needed re-applying for
-- (its default anon/authenticated grants on a newly created function can
-- silently re-appear after a migration completes) -- stated here up front
-- rather than left to a follow-up.
revoke execute on function public.check_and_increment_query_rate_limit() from public;
revoke execute on function public.check_and_increment_query_rate_limit() from anon;
grant execute on function public.check_and_increment_query_rate_limit() to authenticated;
