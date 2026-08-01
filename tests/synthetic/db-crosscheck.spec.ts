import { test, expect } from "@playwright/test";
import {
  signIn,
  sessionToCookies,
  cookiesForContext,
  insertPings,
  deleteAllPings,
  type MonitorSession,
} from "./fixtures/monitor-session";

// Layer 3: compares known values written directly to Supabase against
// what the app's own API returns for that same stop — the strongest
// signal for a date/serialization bug, since it checks against ground
// truth rather than another derived value. This hits /api/query's raw
// JSON directly (not the rendered UI), so it's independent of the
// client-side formatDateTime rendering bug covered in auth-queries.spec.ts.

const FIXTURE_COORDS = { lat: 47.6062, lon: -122.3321 }; // Seattle, arbitrary fixed fixture location

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set to run authenticated synthetic tests`);
  return value;
}

test.describe("direct Supabase cross-check", () => {
  let session: MonitorSession;

  test.beforeAll(async () => {
    session = await signIn();
  });

  test.beforeEach(async () => {
    await deleteAllPings(session);
  });

  test.afterAll(async () => {
    if (session) await deleteAllPings(session);
  });

  test("/api/query returns the exact timestamps stored in Supabase for a fixture stop", async ({
    browser,
  }) => {
    const baseUrl = requireEnv("SYNTHETIC_BASE_URL");
    const arrival = new Date();
    arrival.setUTCHours(20, 0, 0, 0); // mid-afternoon Pacific — nowhere near a day boundary, kept simple/deterministic
    const departure = new Date(arrival.getTime() + 10 * 60_000);
    await insertPings(session, [
      { tst: arrival.toISOString(), ...FIXTURE_COORDS },
      { tst: departure.toISOString(), ...FIXTURE_COORDS },
    ]);

    const cookies = await sessionToCookies(session);
    const context = await browser.newContext({ baseURL: baseUrl });
    await context.addCookies(cookiesForContext(cookies, baseUrl));

    const dateLabel = arrival.toLocaleDateString("en-US", {
      timeZone: "America/Los_Angeles",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const resp = await context.request.post("/api/query", {
      data: { question: `Where was I on ${dateLabel}?` },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.tableRows.length, "fixture pings should produce exactly one stop").toBeGreaterThan(0);
    expect(body.tableRows[0].arrival).toBe(arrival.toISOString());
    expect(body.tableRows[0].departure).toBe(departure.toISOString());
    await context.close();
  });
});
