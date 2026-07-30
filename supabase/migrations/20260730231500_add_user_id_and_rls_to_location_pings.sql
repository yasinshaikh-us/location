-- Add per-user ownership to location_pings and lock it down with RLS.
--
-- Existing rows predate multi-tenancy and are left with user_id = NULL;
-- they remain readable only via the service-role key (used server-side
-- in lib/supabase.ts, which bypasses RLS entirely) until backfilled to
-- a real auth.users row once account signup exists.
--
-- Applied directly to the live project (ognpwwurjipokrqwcmpk) via the
-- Supabase MCP `apply_migration` tool; this file mirrors that change
-- for version-control history and local/CLI parity.

alter table public.location_pings
  add column user_id uuid references auth.users(id);

create index location_pings_user_id_tst_idx
  on public.location_pings (user_id, tst desc);

alter table public.location_pings enable row level security;

create policy "Users manage their own pings"
  on public.location_pings
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
