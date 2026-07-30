import { describe, it, expect } from "vitest";
import { interpolatePosition } from "./interpolate";
import type { RoutePoint } from "./simplify";

const pt = (lat: number, lon: number, tst: string): RoutePoint => ({ lat, lon, tst });

describe("interpolatePosition", () => {
  it("returns null for an empty route", () => {
    expect(interpolatePosition([], Date.now())).toBeNull();
  });

  it("returns the single point, stationary, for a one-point route", () => {
    const route = [pt(47.6, -122.3, "2026-01-01T00:00:00Z")];
    const pos = interpolatePosition(route, new Date("2026-01-01T00:05:00Z").getTime());
    expect(pos).toEqual({ lat: 47.6, lon: -122.3, isMoving: false });
  });

  it("clamps to the first point, stationary, before the route starts", () => {
    const route = [
      pt(47.0, -122.0, "2026-01-01T00:00:00Z"),
      pt(48.0, -123.0, "2026-01-01T01:00:00Z"),
    ];
    const pos = interpolatePosition(route, new Date("2026-01-01T00:00:00Z").getTime() - 1000);
    expect(pos).toEqual({ lat: 47.0, lon: -122.0, isMoving: false });
  });

  it("clamps to the last point, stationary, after the route ends", () => {
    const route = [
      pt(47.0, -122.0, "2026-01-01T00:00:00Z"),
      pt(48.0, -123.0, "2026-01-01T01:00:00Z"),
    ];
    const pos = interpolatePosition(route, new Date("2026-01-01T02:00:00Z").getTime());
    expect(pos).toEqual({ lat: 48.0, lon: -123.0, isMoving: false });
  });

  it("linearly interpolates lat/lon between two surrounding points", () => {
    const route = [
      pt(47.0, -122.0, "2026-01-01T00:00:00Z"),
      pt(48.0, -123.0, "2026-01-01T01:00:00Z"),
    ];
    const pos = interpolatePosition(route, new Date("2026-01-01T00:30:00Z").getTime());
    expect(pos?.lat).toBeCloseTo(47.5, 5);
    expect(pos?.lon).toBeCloseTo(-122.5, 5);
  });

  it("finds the correct segment via binary search across many points", () => {
    const route = Array.from({ length: 20 }, (_, i) =>
      pt(47 + i, -122, new Date(2026, 0, 1, 0, i * 5).toISOString())
    );
    // Halfway between the 10th (i=9, minute 45) and 11th (i=10, minute 50) points.
    const targetMs = new Date(2026, 0, 1, 0, 47, 30).getTime();
    const pos = interpolatePosition(route, targetMs);
    expect(pos?.lat).toBeCloseTo(47 + 9.5, 5);
  });

  it("marks isMoving true for a short gap between points", () => {
    const route = [
      pt(47.0, -122.0, "2026-01-01T00:00:00Z"),
      pt(48.0, -123.0, "2026-01-01T00:05:00Z"),
    ];
    const pos = interpolatePosition(route, new Date("2026-01-01T00:02:30Z").getTime());
    expect(pos?.isMoving).toBe(true);
  });

  it("marks isMoving false for a gap of 10 minutes or more (treated as a stop, not travel)", () => {
    const route = [
      pt(47.0, -122.0, "2026-01-01T00:00:00Z"),
      pt(48.0, -123.0, "2026-01-01T00:15:00Z"),
    ];
    const pos = interpolatePosition(route, new Date("2026-01-01T00:07:30Z").getTime());
    expect(pos?.isMoving).toBe(false);
  });
});
