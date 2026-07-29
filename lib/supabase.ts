import { createClient } from "@supabase/supabase-js";

// Server-only client. Uses the service role key so it can read location_pings
// regardless of RLS. NEVER import this file from a "use client" component.
//
// This module is the ONLY place the service-role client is created, and
// it's intentionally kept private (not exported) — every other server
// file goes through the read-only functions below (fetchPingsInRange,
// checkDatabaseConnectivity) instead of getting a raw client. Both of
// those only ever call `.select(...)`; there is no insert/update/delete/
// upsert anywhere in this app, so the service-role key — which bypasses
// RLS and technically *could* write — never gets the chance to.
function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars"
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

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
 * Read-only by construction: this goes through supabase-js's query
 * builder (`.select().gte().lte()...`), which sends `startIso`/`endIso`
 * as parameterized PostgREST filter values, never interpolated into a
 * raw SQL string — so there's no SQL-injection surface here regardless
 * of what the caller passes. Nothing in this function (or this module)
 * ever calls `.insert()`/`.update()`/`.delete()`/`.upsert()`/`.rpc()`.
 */
export async function fetchPingsInRange(
  startIso: string,
  endIso: string
): Promise<LocationPing[]> {
  const supabase = getSupabaseServerClient();

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

/**
 * Read-only connectivity check used by /api/health — counts rows
 * without returning any of their contents. Kept in this module so the
 * service-role client never has to be handed to another file.
 */
export async function checkDatabaseConnectivity(): Promise<string> {
  try {
    const supabase = getSupabaseServerClient();
    const { count, error } = await supabase
      .from("location_pings")
      .select("*", { count: "exact", head: true });
    return error ? `error: ${error.message}` : `ok (${count} rows)`;
  } catch (e) {
    return `error: ${e instanceof Error ? e.message : "unknown"}`;
  }
}
