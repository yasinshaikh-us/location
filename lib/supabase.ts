import { createClient } from "@supabase/supabase-js";

// Server-only client. Uses the service role key so it can read location_pings
// regardless of RLS. NEVER import this file from a "use client" component.
export function getSupabaseServerClient() {
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
