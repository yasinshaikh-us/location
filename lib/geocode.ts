import type { SupabaseClient } from "@supabase/supabase-js";
import type { Stop } from "./simplify";
import { STOP_RADIUS_METERS } from "./simplify";

export interface GeocodeProvider {
  reverseGeocode(lat: number, lon: number): Promise<string | undefined>;
}

/**
 * Mapbox's Geocoding API -- this app already holds a MAPBOX_TOKEN for
 * map tiles, and unlike Nominatim's free community instance (whose
 * usage policy is explicit that it's for light/personal use, not a
 * multi-user product), Mapbox's geocoding has a real commercial tier
 * meant for this. Requesting these three types, most granular first,
 * gets back at most one feature per type in that same order (Mapbox's
 * own contract for multi-type reverse geocoding), so the first feature
 * is already the most specific name available -- no manual fallback
 * chain needed the way Nominatim's raw address fields required.
 */
async function mapboxReverseGeocode(
  lat: number,
  lon: number
): Promise<string | undefined> {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) return undefined;

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?types=neighborhood,locality,place&access_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) return undefined;

  const data = await res.json();
  const feature = data.features?.[0];
  if (!feature) return undefined;

  // `text` is the short name ("Capitol Hill"); `place_name` is the full
  // formatted address string, used as a fallback if `text` is missing.
  return feature.text ?? feature.place_name?.split(",")[0];
}

export const mapboxProvider: GeocodeProvider = {
  reverseGeocode: mapboxReverseGeocode,
};

// Repeat visits to the same place within one query still dedupe to a
// single lookup via this in-request bucket key -- a fixed-precision
// approximation (~111m x ~75m depending on latitude) that's fine for
// deciding "how many *new* lookups might this one request need." The
// persistent cache itself (see supabase/migrations' place_cache) uses
// an exact distance match instead, so it doesn't accumulate near-
// duplicate rows for the same real place at rounding boundaries the way
// this in-memory key would if used for storage.
function requestBucketKey(stop: Stop): string {
  return `${stop.lat.toFixed(3)},${stop.lon.toFixed(3)}`;
}

// Past this many *new* (not-yet-cached) distinct locations in one
// query, the remaining ones are left ungeocoded rather than risking the
// request's time budget (Vercel's function timeout). This only bites on
// a request touching many places the shared cache has never seen
// before -- as real usage fills the cache, that gets rarer, and a
// request that's mostly cache hits can touch far more than this many
// *total* distinct places without issue.
const MAX_NEW_LOCATIONS_PER_REQUEST = 40;

/**
 * Reverse-geocodes stop coordinates into human-readable place names,
 * backed by a shared cache (the `place_cache` table) so a location,
 * once resolved by any user's query, never needs a fresh provider
 * lookup again -- `provider` (Mapbox by default) is only called for
 * cache misses.
 *
 * Takes a request-scoped, session-bound Supabase client (see
 * lib/supabase-server.ts) -- place_cache's RLS policies allow any
 * authenticated user to read and contribute to it (it isn't per-user
 * data, so there's nothing for RLS to scope by owner), but a caller
 * still has to be a real signed-in user, matching how every other table
 * in this app is only ever touched through the caller's own session.
 */
export async function reverseGeocodeStops(
  supabase: SupabaseClient,
  stops: Stop[],
  provider: GeocodeProvider = mapboxProvider
): Promise<Stop[]> {
  if (stops.length === 0) return stops;

  const keyed = stops.map((stop) => ({ stop, key: requestBucketKey(stop) }));
  const firstByKey = new Map<string, Stop>();
  for (const { stop, key } of keyed) {
    if (!firstByKey.has(key)) firstByKey.set(key, stop);
  }

  // 1. Check the shared cache for every distinct location in this
  //    request. These are plain indexed reads against our own database,
  //    not a rate-limited third-party call, so it's fine to do all of
  //    them concurrently regardless of how many there are.
  const names = new Map<string, string>();
  await Promise.all(
    [...firstByKey.entries()].map(async ([key, stop]) => {
      const { data, error } = await supabase.rpc("nearest_cached_place", {
        p_lon: stop.lon,
        p_lat: stop.lat,
        p_max_meters: STOP_RADIUS_METERS,
      });
      const placeName = !error ? data?.[0]?.place_name : undefined;
      if (placeName) names.set(key, placeName);
    })
  );

  // 2. Only genuinely new locations count against the per-request
  //    geocoding budget -- resolved sequentially (not in parallel) as a
  //    conservative default against the provider's rate limit, with a
  //    short pause between real network calls (not cache hits, which
  //    never reach this loop at all).
  const missingKeys = [...firstByKey.keys()].filter((key) => !names.has(key));
  const keysToResolve = missingKeys.slice(0, MAX_NEW_LOCATIONS_PER_REQUEST);

  for (const key of keysToResolve) {
    const stop = firstByKey.get(key)!;
    let name: string | undefined;
    try {
      name = await provider.reverseGeocode(stop.lat, stop.lon);
    } catch {
      // leave name undefined -- a transient provider failure shouldn't
      // block the rest of the stops in this request.
    }

    if (name) {
      names.set(key, name);
      const { error } = await supabase.rpc("cache_place", {
        p_lon: stop.lon,
        p_lat: stop.lat,
        p_place_name: name,
      });
      if (error) {
        // Best-effort: a failed cache write just means the next query
        // to touch this place pays for another provider lookup, not a
        // user-visible error right now.
        console.error("Failed to write to the shared place cache:", error.message);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return keyed.map(({ stop, key }) => ({ ...stop, placeName: names.get(key) }));
}
