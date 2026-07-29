import type { RoutePoint } from "./simplify";

export interface InterpolatedPosition {
  lat: number;
  lon: number;
  /** 0 = stationary at a point, 1 = mid-transit between two points */
  isMoving: boolean;
}

/**
 * Given a sorted route and a target timestamp (ms epoch), returns the
 * interpolated lat/lon at that instant — linear interpolation between
 * the two surrounding real GPS points, based on elapsed time fraction.
 * Clamps to the first/last point outside the route's own time range.
 */
export function interpolatePosition(
  route: RoutePoint[],
  targetMs: number
): InterpolatedPosition | null {
  if (route.length === 0) return null;
  if (route.length === 1) {
    return { lat: route[0].lat, lon: route[0].lon, isMoving: false };
  }

  const times = route.map((p) => new Date(p.tst).getTime());

  if (targetMs <= times[0]) {
    return { lat: route[0].lat, lon: route[0].lon, isMoving: false };
  }
  const lastIdx = route.length - 1;
  if (targetMs >= times[lastIdx]) {
    return { lat: route[lastIdx].lat, lon: route[lastIdx].lon, isMoving: false };
  }

  // Binary search for the surrounding segment.
  let lo = 0;
  let hi = lastIdx;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (times[mid] <= targetMs) lo = mid;
    else hi = mid;
  }

  const a = route[lo];
  const b = route[hi];
  const tA = times[lo];
  const tB = times[hi];
  const span = tB - tA;
  const frac = span === 0 ? 0 : (targetMs - tA) / span;

  return {
    lat: a.lat + (b.lat - a.lat) * frac,
    lon: a.lon + (b.lon - a.lon) * frac,
    isMoving: span > 0 && span < 1000 * 60 * 10, // treat >10min gaps as a stop, not travel
  };
}
