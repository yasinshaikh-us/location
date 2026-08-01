import { test, expect, chromium, webkit } from "@playwright/test";
import {
  signIn,
  sessionToCookies,
  cookiesForContext,
  insertPings,
  deleteAllPings,
  type MonitorSession,
} from "./fixtures/monitor-session";

// Layer 2: authenticated black-box checks against the real deployed app,
// using a dedicated monitoring Supabase user (see fixtures/monitor-session.ts)
// and fixture GPS pings seeded/torn down around each test. Fixture pings
// come in pairs 10 minutes apart at the same coordinates — clusterIntoStops
// (lib/simplify.ts) requires at least MIN_STOP_MINUTES (8) at the same
// spot before a "stop" (and therefore a table row) is produced at all.
//
// Both tests share one monitoring account's data, so they run serially —
// running them in parallel would let one test's cleanup delete fixture
// rows the other test just inserted.
test.describe.configure({ mode: "serial" });

const FIXTURE_COORDS = { lat: 47.6062, lon: -122.3321 }; // Seattle, arbitrary fixed fixture location

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set to run authenticated synthetic tests`);
  return value;
}

function humanDateLabel(d: Date): string {
  return d.toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

test.describe("natural-language location queries", () => {
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

  test("a specific-date question surfaces the fixture stop", async ({ browser }) => {
    const baseUrl = requireEnv("SYNTHETIC_BASE_URL");
    const arrival = new Date();
    arrival.setUTCHours(20, 0, 0, 0); // mid-afternoon Pacific, comfortably inside one calendar day
    const departure = new Date(arrival.getTime() + 10 * 60_000);
    await insertPings(session, [
      { tst: arrival.toISOString(), ...FIXTURE_COORDS },
      { tst: departure.toISOString(), ...FIXTURE_COORDS },
    ]);

    const cookies = await sessionToCookies(session);
    const context = await browser.newContext({ baseURL: baseUrl });
    await context.addCookies(cookiesForContext(cookies, baseUrl));
    const page = await context.newPage();
    await page.goto("/");

    await page.getByPlaceholder(/where you were/i).fill(`Where was I on ${humanDateLabel(arrival)}?`);
    await page.getByRole("button", { name: "Ask" }).click();

    await expect(page.locator("tbody tr")).toHaveCount(1, { timeout: 30_000 });
    await context.close();
  });

  test("formatDateTime's rendered arrival time matches between Chromium and WebKit", async () => {
    // Regression test for lib/format.ts's formatDateTime: it round-trips a
    // timestamp through toLocaleString() and re-parses the resulting
    // string with new Date(...), which depends on the executing engine's
    // date-string parser rather than the safe Intl.formatToParts pattern
    // used everywhere else in this file (see pacificOffsetMs/todayInPacific).
    // Rendering the exact same fixture stop's arrival time in both engines
    // and comparing catches any divergence directly, without needing to
    // hardcode the "correct" text.
    const baseUrl = requireEnv("SYNTHETIC_BASE_URL");
    const arrival = new Date();
    arrival.setUTCHours(6, 47, 0, 0); // ~11:47 PM the previous Pacific day (PDT) — near a day boundary
    const departure = new Date(arrival.getTime() + 10 * 60_000);
    await insertPings(session, [
      { tst: arrival.toISOString(), ...FIXTURE_COORDS },
      { tst: departure.toISOString(), ...FIXTURE_COORDS },
    ]);

    const cookies = await sessionToCookies(session);
    const question = `Where was I on ${humanDateLabel(arrival)}?`;

    async function arrivedCellTextIn(browserType: typeof chromium | typeof webkit) {
      const b = await browserType.launch();
      const context = await b.newContext({ baseURL: baseUrl });
      await context.addCookies(cookiesForContext(cookies, baseUrl));
      const page = await context.newPage();
      await page.goto("/");
      await page.getByPlaceholder(/where you were/i).fill(question);
      await page.getByRole("button", { name: "Ask" }).click();
      const row = page.locator("tbody tr").first();
      await expect(row).toBeVisible({ timeout: 30_000 });
      const text = await row.locator("td").nth(1).textContent(); // column order: place, arrival, departure, duration
      await b.close();
      return text;
    }

    const [chromiumText, webkitText] = await Promise.all([
      arrivedCellTextIn(chromium),
      arrivedCellTextIn(webkit),
    ]);

    expect(
      webkitText,
      `formatDateTime rendered differently across engines: chromium="${chromiumText}" webkit="${webkitText}" — see lib/format.ts's toLocaleString + re-parse round trip`
    ).toBe(chromiumText);
  });
});
