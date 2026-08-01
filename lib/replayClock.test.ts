import { describe, it, expect } from "vitest";
import { advanceReplayClock, MOVING_MS_PER_SEC } from "./replayClock";
import type { Stop } from "./simplify";

const stop = (arrival: string, departure: string): Stop => ({
  lat: 47.6,
  lon: -122.3,
  arrival,
  departure,
  durationMinutes: (new Date(departure).getTime() - new Date(arrival).getTime()) / 60000,
  pingCount: 5,
});

describe("advanceReplayClock", () => {
  const endMs = new Date("2026-01-01T23:59:59Z").getTime();

  it("advances by deltaSec * MOVING_MS_PER_SEC when not inside any stop", () => {
    const currentMs = new Date("2026-01-01T00:00:00Z").getTime();
    const next = advanceReplayClock(currentMs, 1, [], endMs);
    expect(next).toBe(currentMs + MOVING_MS_PER_SEC);
  });

  it("jumps straight to the stop's departure when currently inside a stop, ignoring deltaSec", () => {
    const arrival = new Date("2026-01-01T00:00:00Z").getTime();
    const departure = new Date("2026-01-01T11:00:00Z").getTime();
    const currentMs = arrival + 1000; // just inside the stop
    const next = advanceReplayClock(
      currentMs,
      1 / 60, // one real-time frame, ~16ms
      [stop("2026-01-01T00:00:00Z", "2026-01-01T11:00:00Z")],
      endMs
    );
    expect(next).toBe(departure);
  });

  it("jumps on the very first frame even if currentMs starts exactly at a stop's arrival", () => {
    const arrival = new Date("2026-01-01T00:00:00Z").getTime();
    const departure = new Date("2026-01-01T11:00:00Z").getTime();
    const next = advanceReplayClock(
      arrival,
      0,
      [stop("2026-01-01T00:00:00Z", "2026-01-01T11:00:00Z")],
      endMs
    );
    expect(next).toBe(departure);
  });

  it("treats a stop's departure as no longer inside it, and resumes normal-speed advancing from there", () => {
    const departure = new Date("2026-01-01T11:00:00Z").getTime();
    const next = advanceReplayClock(
      departure,
      1,
      [stop("2026-01-01T00:00:00Z", "2026-01-01T11:00:00Z")],
      endMs
    );
    expect(next).toBe(departure + MOVING_MS_PER_SEC);
  });

  it("picks the correct stop out of several when currentMs falls inside a later one", () => {
    const stops = [
      stop("2026-01-01T00:00:00Z", "2026-01-01T01:00:00Z"),
      stop("2026-01-01T05:00:00Z", "2026-01-01T09:00:00Z"),
    ];
    const currentMs = new Date("2026-01-01T06:00:00Z").getTime();
    const next = advanceReplayClock(currentMs, 1, stops, endMs);
    expect(next).toBe(new Date("2026-01-01T09:00:00Z").getTime());
  });

  it("never advances past endMs, even mid-stop", () => {
    const next = advanceReplayClock(
      new Date("2026-01-01T00:00:00Z").getTime(),
      1,
      [stop("2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z")],
      endMs
    );
    expect(next).toBe(endMs);
  });

  it("never advances past endMs during normal transit either", () => {
    const next = advanceReplayClock(endMs - 1000, 1000, [], endMs);
    expect(next).toBe(endMs);
  });
});
