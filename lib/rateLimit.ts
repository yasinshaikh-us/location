import type { SupabaseClient } from "@supabase/supabase-js";

// Calls the check_and_increment_query_rate_limit() RPC (see
// supabase/migrations/20260818000000_add_query_rate_limit.sql) with the
// caller's request-scoped, session-bound Supabase client (from
// lib/supabase-server.ts) -- same RLS-respecting pattern as
// fetchPingsInRange and lib/geocode.ts's RPC calls, never a
// service-role key. Used by /api/query to cap how often a signed-in
// user can trigger a billed pair of Anthropic calls.
export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export async function checkQueryRateLimit(
  supabase: SupabaseClient
): Promise<RateLimitResult> {
  const { data, error } = await supabase.rpc(
    "check_and_increment_query_rate_limit"
  );

  if (error) {
    throw new Error(`Supabase rate-limit check failed: ${error.message}`);
  }

  // RETURNS TABLE with no set-returning input always produces exactly
  // one row, same PostgREST array-wrapping as nearest_cached_place().
  const row = data?.[0];
  return {
    allowed: !!row?.allowed,
    retryAfterSeconds: Number(row?.retry_after_seconds) || 0,
  };
}
