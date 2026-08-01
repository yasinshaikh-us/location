import type { LocationPing } from "./supabase";

export interface Stop {
  lat: number;
  lon: number;
  arrival: string; // ISO
  departure: string; // ISO
  durationMinutes: number;
  pingCount: number;
  placeName?: string;
  // False when this stop's cluster starts at the very first queried ping
  // (arrivalKnown) or ends at the very last one (departureKnown) -- i.e.
  // there's no ping in the queried range showing actual movement into or
  // out of it, so `arrival`/`departure` just reflect where the query
  // window happens to start/end, not a real arrival or departure event.
  arrivalKnown: boolean;
  departureKnown: boolean;
}

export interface RoutePoint {
  lat: number;
  lon: number;
  tst: string;
}

const EARTH_RADIUS_M = 6371000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Haversine distance in meters between two lat/lon points. */
export function haversineMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Groups consecutive pings into "stops" when the person stays within
 * STOP_RADIUS_METERS of each other for at least MIN_STOP_MINUTES.
 * Everything else is treated as "in transit" and passed through to the
 * route polyline instead.
 */
const STOP_RADIUS_METERS = 120;
const MIN_STOP_MINUTES = 8;

export function clusterIntoStops(pings: LocationPing[]): {
  stops: Stop[];
  route: RoutePoint[];
} {
  const route: RoutePoint[] = pings.map((p) => ({
    lat: p.lat,
    lon: p.lon,
    tst: p.tst,
  }));

  if (pings.length === 0) {
    return { stops: [], route: [] };
  }

  const stops: Stop[] = [];
  let clusterStart = 0;

  for (let i = 1; i <= pings.length; i++) {
    const isLast = i === pings.length;
    const withinRadius =
      !isLast &&
      haversineMeters(pings[clusterStart], pings[i]) <= STOP_RADIUS_METERS;

    if (withinRadius) continue;

    // Close out the cluster [clusterStart, i)
    const clusterPings = pings.slice(clusterStart, i);
    const arrival = clusterPings[0].tst;
    const departure = clusterPings[clusterPings.length - 1].tst;
    const durationMinutes =
      (new Date(departure).getTime() - new Date(arrival).getTime()) / 60000;

    if (durationMinutes >= MIN_STOP_MINUTES) {
      const avgLat =
        clusterPings.reduce((sum, p) => sum + p.lat, 0) / clusterPings.length;
      const avgLon =
        clusterPings.reduce((sum, p) => sum + p.lon, 0) / clusterPings.length;

      stops.push({
        lat: avgLat,
        lon: avgLon,
        arrival,
        departure,
        durationMinutes: Math.round(durationMinutes),
        pingCount: clusterPings.length,
        // clusterStart === 0 only for the very first cluster processed,
        // and isLast only for the very last -- so these single checks
        // are enough to flag a stop that runs off either edge of the
        // queried pings, with no observed arrival/departure in range.
        arrivalKnown: clusterStart !== 0,
        departureKnown: !isLast,
      });
    }

    clusterStart = i;
  }

  return { stops, route };
}

/**
 * Douglas-Peucker simplification for the "in transit" polyline, so we
 * don't ship thousands of near-duplicate points to the client/Claude.
 */
export function simplifyRoute(
  points: RoutePoint[],
  toleranceMeters = 15
): RoutePoint[] {
  if (points.length <= 2) return points;

  function perpendicularDistance(
    p: RoutePoint,
    a: RoutePoint,
    b: RoutePoint
  ): number {
    // Approximate flat-plane distance using haversine for endpoints,
    // good enough at city scale for simplification purposes.
    const abDist = haversineMeters(a, b);
    if (abDist === 0) return haversineMeters(p, a);

    // Project using equirectangular approx for the cross-track distance.
    const lat0 = toRad(a.lat);
    const toXY = (pt: RoutePoint) => ({
      x: toRad(pt.lon - a.lon) * Math.cos(lat0) * EARTH_RADIUS_M,
      y: toRad(pt.lat - a.lat) * EARTH_RADIUS_M,
    });
    const A = toXY(a);
    const B = toXY(b);
    const P = toXY(p);

    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return haversineMeters(p, a);

    const t = ((P.x - A.x) * dx + (P.y - A.y) * dy) / lenSq;
    const projX = A.x + t * dx;
    const projY = A.y + t * dy;
    return Math.sqrt((P.x - projX) ** 2 + (P.y - projY) ** 2);
  }

  function dp(pts: RoutePoint[]): RoutePoint[] {
    if (pts.length <= 2) return pts;

    let maxDist = -1;
    let maxIndex = 0;
    const first = pts[0];
    const last = pts[pts.length - 1];

    for (let i = 1; i < pts.length - 1; i++) {
      const dist = perpendicularDistance(pts[i], first, last);
      if (dist > maxDist) {
        maxDist = dist;
        maxIndex = i;
      }
    }

    if (maxDist > toleranceMeters) {
      const left = dp(pts.slice(0, maxIndex + 1));
      const right = dp(pts.slice(maxIndex));
      return [...left.slice(0, -1), ...right];
    }

    return [first, last];
  }

  return dp(points);
}

// Nominatim's free endpoint is capped at 1 request/second, so a query
// spanning many distinct places (as opposed to many *stops* -- see
// locationKey below) could run past this function's time/rate budget.
// Past this many distinct locations, every stop is returned unchanged
// (no placeName) rather than risking the request timing out partway
// through and leaving some stops geocoded and others not.
const MAX_DISTINCT_LOCATIONS = 20;

// Buckets a stop's coordinates to ~111m of precision (close to
// clusterIntoStops' own STOP_RADIUS_METERS) so repeat visits to the same
// place -- e.g. a home base returned to throughout a multi-day query --
// dedupe to the same key rather than each counting as a separate
// distinct location.
function locationKey(stop: Stop): string {
  return `${stop.lat.toFixed(3)},${stop.lon.toFixed(3)}`;
}

/**
 * Reverse-geocodes stop coordinates into human-readable place names
 * using the free Nominatim (OpenStreetMap) API. Stops that bucket to the
 * same locationKey (repeat visits to the same place) share a single
 * lookup rather than each costing a separate rate-limited request.
 * Requests are run sequentially with a small delay between them to
 * respect Nominatim's 1 req/sec usage policy.
 */
export async function reverseGeocodeStops(stops: Stop[]): Promise<Stop[]> {
  const distinctCount = new Set(stops.map(locationKey)).size;
  if (distinctCount > MAX_DISTINCT_LOCATIONS) return stops;

  const cache = new Map<string, string | undefined>();
  const results: Stop[] = [];

  for (const stop of stops) {
    const key = locationKey(stop);

    if (cache.has(key)) {
      results.push({ ...stop, placeName: cache.get(key) });
      continue;
    }

    let name: string | undefined;
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${stop.lat}&lon=${stop.lon}&format=jsonv2&zoom=16`;
      const res = await fetch(url, {
        headers: {
          // Nominatim usage policy requires a descriptive User-Agent.
          "User-Agent": "location-timeline-app/0.1 (personal project)",
        },
      });

      if (res.ok) {
        const data = await res.json();
        const address = data.address ?? {};
        // Prefer neighborhood-level area names over a precise street
        // address — "Capitol Hill" reads better in a summary/table than
        // "1234 15th Ave E", and approximate is fine for this app.
        name =
          address.neighbourhood ||
          address.suburb ||
          address.quarter ||
          address.city_district ||
          address.town ||
          address.village ||
          address.city ||
          data.name ||
          address.road ||
          data.display_name?.split(",").slice(0, 2).join(",");
      }
    } catch {
      // leave name undefined -- caches the miss so a retry isn't
      // attempted for other stops sharing this same location.
    }

    cache.set(key, name);
    results.push({ ...stop, placeName: name });

    // Be polite to the free Nominatim endpoint -- only needed after an
    // actual network call, not a cache hit above.
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return results;
}
