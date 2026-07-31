import type { SupabaseClient } from "@supabase/supabase-js";

// fetchPingsInRange takes a request-scoped client (see
// lib/supabase-server.ts) bound to the signed-in user's session — that's
// what makes location_pings' `auth.uid() = user_id` RLS policy actually
// the thing doing the per-user filtering, rather than app code. This
// module deliberately has no service-role client: there is nothing here
// that needs to bypass RLS.

export interface LocationPing {
  id: number;
  tid: string | null;
  tst: string; // ISO timestamp
  lat: number;
  lon: number;
  alt: number | null;
  acc: number | null;
  vel: number | null;
  batt: number | null;
  conn: string | null;
}

/**
 * Fetch raw pings between two ISO timestamps, ordered chronologically.
 * Capped at 20,000 rows as a safety valve against runaway date ranges.
 *
 * Takes a request-scoped, session-bound Supabase client (from
 * lib/supabase-server.ts) rather than creating its own — the caller's
 * `location_pings` RLS policy (`auth.uid() = user_id`) is what actually
 * restricts this to the signed-in user's own rows.
 *
 * Read-only by construction: this goes through supabase-js's query
 * builder (`.select().gte().lte()...`), which sends `startIso`/`endIso`
 * as parameterized PostgREST filter values, never interpolated into a
 * raw SQL string — so there's no SQL-injection surface here regardless
 * of what the caller passes. Nothing in this function ever calls
 * `.insert()`/`.update()`/`.delete()`/`.upsert()`/`.rpc()`.
 */
export async function fetchPingsInRange(
  supabase: SupabaseClient,
  startIso: string,
  endIso: string
): Promise<LocationPing[]> {
  const { data, error } = await supabase
    .from("location_pings")
    .select("id, tid, tst, lat, lon, alt, acc, vel, batt, conn")
    .gte("tst", startIso)
    .lte("tst", endIso)
    .order("tst", { ascending: true })
    .limit(20000);

  if (error) {
    throw new Error(`Supabase query failed: ${error.message}`);
  }

  return data ?? [];
}
