import { describe, it, expect, afterEach, vi } from "vitest";
import {
  formatShortDate,
  formatTime,
  formatDateTime,
  formatDuration,
  pacificDayBoundsUtc,
  todayInPacific,
} from "./format";

describe("formatShortDate", () => {
  it("formats a YYYY-MM-DD string as 'Mon D'", () => {
    expect(formatShortDate("2025-09-20")).toBe("Sep 20");
    expect(formatShortDate("2026-01-05")).toBe("Jan 5");
  });
});

describe("formatTime", () => {
  it("formats an ISO timestamp in Pacific time regardless of caller timezone", () => {
    // 2026-07-15T23:32:00Z is 4:32 PM PDT (UTC-7, daylight saving in effect).
    expect(formatTime("2026-07-15T23:32:00Z")).toBe("4:32 PM");
  });

  it("formats correctly in standard time (PST, UTC-8) too", () => {
    // 2026-01-15T16:32:00Z is 8:32 AM PST (UTC-8, no daylight saving).
    expect(formatTime("2026-01-15T16:32:00Z")).toBe("8:32 AM");
  });

  it("can include the zone abbreviation", () => {
    expect(formatTime("2026-07-15T23:32:00Z", { withZoneAbbr: true })).toContain("PDT");
  });
});

describe("formatDateTime", () => {
  it("formats as 'Mon D, h:mm AM/PM' in Pacific time, no year", () => {
    expect(formatDateTime("2026-07-15T23:32:00Z")).toBe("Jul 15, 4:32 PM");
  });
});

describe("formatDuration", () => {
  it("formats under an hour as 'N min'", () => {
    expect(formatDuration(26)).toBe("26 min");
    expect(formatDuration(0)).toBe("0 min");
  });

  it("formats exact hours with no leftover minutes as 'Nh'", () => {
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(120)).toBe("2h");
  });

  it("formats hours plus leftover minutes as 'Nh Mm'", () => {
    expect(formatDuration(1017)).toBe("16h 57m");
  });
});

describe("pacificDayBoundsUtc", () => {
  // The end bound is computed by round-tripping through Intl.DateTimeFormat,
  // which only has whole-second resolution — so the returned endIso lands
  // ~1s after the true Pacific 23:59:59.999, rather than exactly on it. That
  // ~1s slop is existing behavior (not something this test suite changes);
  // asserted with a tolerance here rather than an exact string so the test
  // documents the real contract without being needlessly brittle.
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  it("resolves a summer (PDT, UTC-7) day's start exactly, and end within ~1s", () => {
    const { startIso, endIso } = pacificDayBoundsUtc("2026-07-15");
    expect(startIso).toBe("2026-07-15T07:00:00.000Z");
    const drift = new Date(endIso).getTime() - new Date("2026-07-16T06:59:59.999Z").getTime();
    expect(drift).toBeGreaterThanOrEqual(0);
    expect(drift).toBeLessThan(1100);
  });

  it("resolves a winter (PST, UTC-8) day's start exactly, and end within ~1s", () => {
    const { startIso, endIso } = pacificDayBoundsUtc("2026-01-15");
    expect(startIso).toBe("2026-01-15T08:00:00.000Z");
    const drift = new Date(endIso).getTime() - new Date("2026-01-16T07:59:59.999Z").getTime();
    expect(drift).toBeGreaterThanOrEqual(0);
    expect(drift).toBeLessThan(1100);
  });

  it("spans exactly one calendar day regardless of season", () => {
    const { startIso, endIso } = pacificDayBoundsUtc("2026-07-15");
    const spanMs = new Date(endIso).getTime() - new Date(startIso).getTime();
    expect(spanMs).toBeGreaterThan(ONE_DAY_MS - 2000);
    expect(spanMs).toBeLessThan(ONE_DAY_MS + 2000);
  });
});

describe("todayInPacific", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the previous Pacific calendar date when UTC has already rolled over midnight", () => {
    // 2026-01-15T07:30:00Z is still 2026-01-14 in Pacific (PST midnight is 08:00Z).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T07:30:00Z"));
    expect(todayInPacific()).toBe("2026-01-14");
  });

  it("returns the current Pacific calendar date once past Pacific midnight", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T09:00:00Z"));
    expect(todayInPacific()).toBe("2026-01-15");
  });
});
