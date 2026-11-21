-- Narrows "Users manage their own pings" from ALL (SELECT/INSERT/UPDATE/
-- DELETE) down to SELECT only.
--
-- This app's only read path against location_pings is fetchPingsInRange()
-- (lib/supabase.ts), which is read-only by construction and test-enforced
-- as such (see lib/supabase.test.ts's mock, which doesn't even expose
-- insert/update/delete/upsert/rpc). There is no edit/delete-ping feature
-- anywhere in this client. The only write path into this table at all is
-- the owntracks-ingest Edge Function, which uses SUPABASE_SERVICE_ROLE_KEY
-- and therefore bypasses RLS entirely regardless of what policies exist
-- here -- confirmed directly from that function's source.
--
-- Leaving INSERT/UPDATE/DELETE granted to `authenticated` was pure unused
-- headroom: a leaked/stolen Supabase session for a signed-in user could
-- otherwise call PostgREST's location_pings endpoint directly and
-- corrupt or wipe that user's own GPS history in one call, with no
-- confirmation and no soft-delete. This mirrors the identical fix already
-- applied to the sibling financial-transactions dashboard's `transactions`
-- table (see that repo's 20260805030000_narrow_transactions_rls.sql) --
-- same failure mode, same narrowing.
--
-- If a ping-editing or ping-deletion feature is ever added to this app,
-- add back narrowly-scoped UPDATE/DELETE policies at that point rather
-- than reverting to a blanket ALL.

drop policy "Users manage their own pings" on public.location_pings;

create policy "Users read their own pings"
  on public.location_pings
  for select
  to authenticated
  using (auth.uid() = user_id);
