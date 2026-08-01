import { describe, it, expect } from "vitest";
import { haversineMeters, clusterIntoStops, simplifyRoute } from "./simplify";
import type { RoutePoint } from "./simplify";
import type { LocationPing } from "./supabase";

let nextId = 1;
function ping(lat: number, lon: number, tst: string): LocationPing {
  return {
    id: nextId++,
    tid: "phone1",
    tst,
    lat,
    lon,
    alt: null,
    acc: null,
    vel: null,
    batt: null,
    conn: null,
  };
}

describe("haversineMeters", () => {
  it("returns 0 for identical points", () => {
    expect(haversineMeters({ lat: 47.6, lon: -122.3 }, { lat: 47.6, lon: -122.3 })).toBe(0);
  });

  it("matches a known real-world distance (roughly 1 degree of latitude = ~111km)", () => {
    const d = haversineMeters({ lat: 47.0, lon: -122.0 }, { lat: 48.0, lon: -122.0 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });
});

describe("clusterIntoStops", () => {
  it("returns empty stops/route for no pings", () => {
    expect(clusterIntoStops([])).toEqual({ stops: [], route: [] });
  });

  it("always returns every ping in route, regardless of stop clustering", () => {
    const pings = [
      ping(47.0, -122.0, "2026-01-01T00:00:00Z"),
      ping(47.0, -122.0, "2026-01-01T00:05:00Z"),
    ];
    const { route } = clusterIntoStops(pings);
    expect(route).toEqual([
      { lat: 47.0, lon: -122.0, tst: "2026-01-01T00:00:00Z" },
      { lat: 47.0, lon: -122.0, tst: "2026-01-01T00:05:00Z" },
    ]);
  });

  it("groups pings within the stop radius for long enough into a single stop", () => {
    const pings = [
      ping(47.0, -122.0, "2026-01-01T00:00:00Z"),
      ping(47.0, -122.0, "2026-01-01T00:05:00Z"),
      ping(47.0, -122.0, "2026-01-01T00:10:00Z"), // 10 min span, >= MIN_STOP_MINUTES (8)
    ];
    const { stops } = clusterIntoStops(pings);
    expect(stops).toHaveLength(1);
    expect(stops[0]).toMatchObject({
      lat: 47.0,
      lon: -122.0,
      arrival: "2026-01-01T00:00:00Z",
      departure: "2026-01-01T00:10:00Z",
      durationMinutes: 10,
      pingCount: 3,
      // The whole queried window is this one stop -- no ping shows
      // arrival into or departure from it.
      arrivalKnown: false,
      departureKnown: false,
    });
  });

  it("does not record a stop when the dwell time is under MIN_STOP_MINUTES", () => {
    const pings = [
      ping(47.0, -122.0, "2026-01-01T00:00:00Z"),
      ping(47.0, -122.0, "2026-01-01T00:01:00Z"),
    ];
    expect(clusterIntoStops(pings).stops).toEqual([]);
  });

  it("splits into separate stops when the person moves far away and stays elsewhere (regression: clusters compare to cluster start, not the previous ping)", () => {
    const pings = [
      // Stop A: 47.0,-122.0 for 10 minutes.
      ping(47.0, -122.0, "2026-01-01T00:00:00Z"),
      ping(47.0, -122.0, "2026-01-01T00:05:00Z"),
      ping(47.0, -122.0, "2026-01-01T00:10:00Z"),
      // Jump ~5.5km away (well outside the 120m stop radius) and stay put.
      ping(47.05, -122.0, "2026-01-01T00:11:00Z"),
      ping(47.05, -122.0, "2026-01-01T00:16:00Z"),
      ping(47.05, -122.0, "2026-01-01T00:21:00Z"),
      ping(47.05, -122.0, "2026-01-01T00:26:00Z"), // Stop B: 15 min span
    ];
    const { stops, route } = clusterIntoStops(pings);
    expect(route).toHaveLength(7);
    expect(stops).toHaveLength(2);
    // Stop A opens the queried window (arrival unknown) but there's a
    // ping showing it ends (departure known, into the jump to Stop B).
    expect(stops[0]).toMatchObject({
      lat: 47.0,
      lon: -122.0,
      pingCount: 3,
      durationMinutes: 10,
      arrivalKnown: false,
      departureKnown: true,
    });
    // Stop B is arrived at via that same jump (arrival known) but closes
    // out the queried window (departure unknown).
    expect(stops[1]).toMatchObject({
      lat: 47.05,
      lon: -122.0,
      pingCount: 4,
      durationMinutes: 15,
      arrivalKnown: true,
      departureKnown: false,
    });
  });

  it("marks both arrival and departure known for a stop with observed movement on both sides", () => {
    const pings = [
      // In transit into Stop A.
      ping(46.9, -121.9, "2026-01-01T00:00:00Z"),
      // Stop A: 10 min span.
      ping(47.0, -122.0, "2026-01-01T00:05:00Z"),
      ping(47.0, -122.0, "2026-01-01T00:10:00Z"),
      ping(47.0, -122.0, "2026-01-01T00:15:00Z"),
      // In transit away from Stop A.
      ping(47.1, -122.1, "2026-01-01T00:20:00Z"),
    ];
    const { stops } = clusterIntoStops(pings);
    expect(stops).toHaveLength(1);
    expect(stops[0]).toMatchObject({ arrivalKnown: true, departureKnown: true });
  });

  it("averages lat/lon across all pings in the cluster", () => {
    // Offset small enough (~40m) to stay within the 120m stop radius of the
    // cluster's first ping.
    const pings = [
      ping(47.0, -122.0, "2026-01-01T00:00:00Z"),
      ping(47.0003, -122.0003, "2026-01-01T00:05:00Z"),
      ping(47.0, -122.0, "2026-01-01T00:10:00Z"),
    ];
    const { stops } = clusterIntoStops(pings);
    expect(stops).toHaveLength(1);
    expect(stops[0].lat).toBeCloseTo((47.0 + 47.0003 + 47.0) / 3, 6);
    expect(stops[0].lon).toBeCloseTo((-122.0 + -122.0003 + -122.0) / 3, 6);
  });
});

describe("simplifyRoute", () => {
  it("returns the input unchanged when there are 2 or fewer points", () => {
    const points: RoutePoint[] = [
      { lat: 47.0, lon: -122.0, tst: "t0" },
      { lat: 48.0, lon: -122.0, tst: "t1" },
    ];
    expect(simplifyRoute(points)).toEqual(points);
  });

  it("collapses colinear points on a straight line down to just the endpoints", () => {
    const points: RoutePoint[] = Array.from({ length: 10 }, (_, i) => ({
      lat: 47.0 + i * 0.001,
      lon: -122.0,
      tst: `t${i}`,
    }));
    const out = simplifyRoute(points);
    expect(out).toEqual([points[0], points[9]]);
  });

  it("preserves a point that deviates significantly from the line (a real turn/detour)", () => {
    const points: RoutePoint[] = [
      { lat: 47.0, lon: -122.0, tst: "t0" },
      { lat: 47.005, lon: -122.005, tst: "t1" }, // ~380m sideways deviation
      { lat: 47.01, lon: -122.0, tst: "t2" },
    ];
    const out = simplifyRoute(points, 15);
    expect(out).toHaveLength(3);
    expect(out[1]).toEqual(points[1]);
  });
});
