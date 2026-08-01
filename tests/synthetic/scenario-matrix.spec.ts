import { test, expect } from "@playwright/test";
import {
  signIn,
  sessionToCookies,
  cookiesForContext,
  insertPings,
  deleteAllPings,
  type MonitorSession,
} from "./fixtures/monitor-session";

// Layer 2 expansion: a broader matrix of real natural-language queries
// against the deployed app, covering relative-date phrasing, weekends,
// multi-day ranges, near-vs-far-back dates, multi-stop days, and a real
// DST-transition date — dimensions auth-queries.spec.ts's two targeted
// tests don't touch. Roughly half go through the real browser UI (for
// rendering coverage); the rest hit /api/query's raw JSON directly for
// precise date-resolution assertions that don't depend on guessing DOM
// structure.
//
// All tests share one monitoring account's data, so they run serially —
// running them in parallel would let one test's cleanup delete fixture
// rows another test just inserted.
test.describe.configure({ mode: "serial" });

const COORDS_A = { lat: 47.6062, lon: -122.3321 }; // Seattle downtown, arbitrary fixed fixture location
const COORDS_B = { lat: 47.66, lon: -122.36 }; // >120m from COORDS_A, so clusterIntoStops treats it as a separate stop

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set to run authenticated synthetic tests`);
  return value;
}

function middayUtcOn(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(20, 0, 0, 0); // ~1pm Pacific, safely mid-day, no calendar-boundary ambiguity
  return d;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

function monthsAgo(n: number): Date {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - n);
  return d;
}

// Most recent occurrence of the given weekday (0=Sun..6=Sat) strictly before today.
function lastWeekday(targetDow: number): Date {
  const d = new Date();
  const diff = (d.getUTCDay() - targetDow + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

function humanDateLabel(d: Date): string {
  return d.toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// A stop needs two pings >= MIN_STOP_MINUTES apart at the same spot
// (lib/simplify.ts) before it registers at all.
function stopPings(day: Date, coords: { lat: number; lon: number } = COORDS_A) {
  const arrival = middayUtcOn(day);
  const departure = new Date(arrival.getTime() + 10 * 60_000);
  return [
    { tst: arrival.toISOString(), ...coords },
    { tst: departure.toISOString(), ...coords },
  ];
}

test.describe("expanded location scenario matrix", () => {
  let session: MonitorSession;
  let baseUrl: string;

  test.beforeAll(async () => {
    session = await signIn();
    baseUrl = requireEnv("SYNTHETIC_BASE_URL");
  });

  test.beforeEach(async () => {
    await deleteAllPings(session);
  });

  test.afterAll(async () => {
    if (session) await deleteAllPings(session);
  });

  test("'yesterday' surfaces exactly the fixture stop from that day (UI)", async ({ browser }) => {
    const yesterday = daysAgo(1);
    await insertPings(session, stopPings(yesterday));

    const cookies = await sessionToCookies(session);
    const context = await browser.newContext({ baseURL: baseUrl });
    await context.addCookies(cookiesForContext(cookies, baseUrl));
    const page = await context.newPage();
    await page.goto("/");
    await page.getByPlaceholder(/where you were/i).fill("Where was I yesterday?");
    await page.getByRole("button", { name: "Ask" }).click();

    await expect(page.locator("tbody tr")).toHaveCount(1, { timeout: 30_000 });
    await context.close();
  });

  test("'last Tuesday' resolves to the correct calendar date (API)", async ({ browser }) => {
    const tuesday = lastWeekday(2);
    await insertPings(session, stopPings(tuesday));

    const cookies = await sessionToCookies(session);
    const context = await browser.newContext({ baseURL: baseUrl });
    await context.addCookies(cookiesForContext(cookies, baseUrl));
    const resp = await context.request.post("/api/query", {
      data: { question: "Where was I last Tuesday?" },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.dateRange.start).toBe(isoDate(tuesday));
    expect(body.dateRange.end).toBe(isoDate(tuesday));
    expect(body.tableRows.length).toBeGreaterThan(0);
    await context.close();
  });

  test("'last weekend' spans both Saturday and Sunday (UI)", async ({ browser }) => {
    const saturday = lastWeekday(6);
    const sunday = new Date(saturday);
    sunday.setUTCDate(saturday.getUTCDate() + 1);
    await insertPings(session, [...stopPings(saturday), ...stopPings(sunday, COORDS_B)]);

    const cookies = await sessionToCookies(session);
    const context = await browser.newContext({ baseURL: baseUrl });
    await context.addCookies(cookiesForContext(cookies, baseUrl));
    const page = await context.newPage();
    await page.goto("/");
    await page.getByPlaceholder(/where you were/i).fill("Where was I last weekend?");
    await page.getByRole("button", { name: "Ask" }).click();

    await expect(page.locator("tbody tr")).toHaveCount(2, { timeout: 30_000 });
    await context.close();
  });

  test("'7 months ago' resolves to the correct calendar date (API)", async ({ browser }) => {
    const target = monthsAgo(7);
    target.setUTCDate(10); // fixed day-of-month, avoids month-length edge cases
    await insertPings(session, stopPings(target));

    const cookies = await sessionToCookies(session);
    const context = await browser.newContext({ baseURL: baseUrl });
    await context.addCookies(cookiesForContext(cookies, baseUrl));
    const resp = await context.request.post("/api/query", {
      data: { question: "Where was I 7 months ago?" },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.dateRange.start).toBe(isoDate(target));
    expect(body.dateRange.end).toBe(isoDate(target));
    expect(body.tableRows.length).toBeGreaterThan(0);
    await context.close();
  });

  test("a multi-day range question returns every stop in range (UI)", async ({ browser }) => {
    await insertPings(session, [
      ...stopPings(daysAgo(0), COORDS_A),
      ...stopPings(daysAgo(2), COORDS_B),
      ...stopPings(daysAgo(4), COORDS_A),
    ]);

    const cookies = await sessionToCookies(session);
    const context = await browser.newContext({ baseURL: baseUrl });
    await context.addCookies(cookiesForContext(cookies, baseUrl));
    const page = await context.newPage();
    await page.goto("/");
    await page.getByPlaceholder(/where you were/i).fill("Where was I in the last 5 days?");
    await page.getByRole("button", { name: "Ask" }).click();

    await expect(page.locator("tbody tr")).toHaveCount(3, { timeout: 30_000 });
    await context.close();
  });

  test("a date with no location data renders the empty-table state (UI)", async ({ browser }) => {
    // No pings inserted for this test at all — beforeEach already wiped
    // the account, so any date is guaranteed empty.
    const emptyDay = daysAgo(3);

    const cookies = await sessionToCookies(session);
    const context = await browser.newContext({ baseURL: baseUrl });
    await context.addCookies(cookiesForContext(cookies, baseUrl));
    const page = await context.newPage();
    await page.goto("/");
    await page.getByPlaceholder(/where you were/i).fill(`Where was I on ${humanDateLabel(emptyDay)}?`);
    await page.getByRole("button", { name: "Ask" }).click();

    await expect(page.getByText(/No stops to show for this range/i)).toBeVisible({ timeout: 30_000 });
    await context.close();
  });

  test("multiple distinct stops in one day are returned in chronological order (API)", async ({ browser }) => {
    const day = daysAgo(1);
    const morning = middayUtcOn(day);
    morning.setUTCHours(15, 0, 0, 0); // ~8am Pacific
    const morningDeparture = new Date(morning.getTime() + 10 * 60_000);
    const afternoon = middayUtcOn(day);
    afternoon.setUTCHours(23, 0, 0, 0); // ~4pm Pacific
    const afternoonDeparture = new Date(afternoon.getTime() + 10 * 60_000);

    await insertPings(session, [
      { tst: morning.toISOString(), ...COORDS_A },
      { tst: morningDeparture.toISOString(), ...COORDS_A },
      { tst: afternoon.toISOString(), ...COORDS_B },
      { tst: afternoonDeparture.toISOString(), ...COORDS_B },
    ]);

    const cookies = await sessionToCookies(session);
    const context = await browser.newContext({ baseURL: baseUrl });
    await context.addCookies(cookiesForContext(cookies, baseUrl));
    const resp = await context.request.post("/api/query", {
      data: { question: `Where was I on ${humanDateLabel(day)}?` },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.tableRows.length).toBe(2);
    expect(new Date(body.tableRows[0].arrival).getTime()).toBeLessThan(
      new Date(body.tableRows[1].arrival).getTime()
    );
    await context.close();
  });

  test("a stop straddling the spring DST transition passes through exactly (API)", async ({ browser }) => {
    // 2026-03-08 is the US spring-forward transition (2:00 AM PST becomes
    // 3:00 AM PDT), i.e. 2026-03-08T10:00:00Z. Seeding a stop that starts
    // just before and ends just after that instant exercises
    // pacificDayBoundsUtc's day-boundary math right where it matters most.
    const arrival = new Date("2026-03-08T09:50:00.000Z");
    const departure = new Date("2026-03-08T10:10:00.000Z");
    await insertPings(session, [
      { tst: arrival.toISOString(), ...COORDS_A },
      { tst: departure.toISOString(), ...COORDS_A },
    ]);

    const cookies = await sessionToCookies(session);
    const context = await browser.newContext({ baseURL: baseUrl });
    await context.addCookies(cookiesForContext(cookies, baseUrl));
    const resp = await context.request.post("/api/query", {
      data: { question: "Where was I on March 8, 2026?" },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.dateRange.start).toBe("2026-03-08");
    expect(body.dateRange.end).toBe("2026-03-08");
    expect(body.tableRows.length).toBeGreaterThan(0);
    expect(new Date(body.tableRows[0].arrival).getTime()).toBe(arrival.getTime());
    expect(new Date(body.tableRows[0].departure).getTime()).toBe(departure.getTime());
    await context.close();
  });

  test("a date over a year in the past still resolves correctly (UI)", async ({ browser }) => {
    const farBack = monthsAgo(13);
    farBack.setUTCDate(10);
    await insertPings(session, stopPings(farBack));

    const cookies = await sessionToCookies(session);
    const context = await browser.newContext({ baseURL: baseUrl });
    await context.addCookies(cookiesForContext(cookies, baseUrl));
    const page = await context.newPage();
    await page.goto("/");
    await page.getByPlaceholder(/where you were/i).fill(`Where was I on ${humanDateLabel(farBack)}?`);
    await page.getByRole("button", { name: "Ask" }).click();

    await expect(page.locator("tbody tr")).toHaveCount(1, { timeout: 30_000 });
    await context.close();
  });
});
