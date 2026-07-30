import { test, expect } from "@playwright/test";

// The PIN matches playwright.config.ts's webServer env (SITE_PIN=123456).
// Login itself runs for real (middleware.ts, lib/auth.ts, the real
// /api/auth/login route) — only /api/query is mocked at the network layer,
// standing in for what Supabase/Claude would return, so this test needs no
// real Anthropic/Supabase credentials.
const PIN = "123456";

const FIXTURE_RESPONSE = {
  question: "where was I yesterday",
  dateRange: { start: "2026-07-28", end: "2026-07-28" },
  summary: "You spent most of the day in the Capitol Hill area.",
  stops: [
    {
      lat: 47.6253,
      lon: -122.3222,
      arrival: "2026-07-28T15:00:00Z",
      departure: "2026-07-28T17:00:00Z",
      durationMinutes: 120,
      pingCount: 40,
      placeName: "Capitol Hill",
    },
  ],
  route: [
    { lat: 47.6205, lon: -122.1795, tst: "2026-07-28T14:00:00Z" },
    { lat: 47.6253, lon: -122.3222, tst: "2026-07-28T15:00:00Z" },
  ],
  geojson: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [-122.1795, 47.6205],
            [-122.3222, 47.6253],
          ],
        },
        properties: { kind: "route" },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [-122.3222, 47.6253] },
        properties: {
          kind: "stop",
          index: 0,
          place: "Capitol Hill",
          arrival: "2026-07-28T15:00:00Z",
          departure: "2026-07-28T17:00:00Z",
          durationMinutes: 120,
        },
      },
    ],
  },
  tableRows: [
    {
      index: 1,
      place: "Capitol Hill",
      arrival: "2026-07-28T15:00:00Z",
      departure: "2026-07-28T17:00:00Z",
      durationMinutes: 120,
      lat: 47.6253,
      lon: -122.3222,
    },
  ],
};

async function login(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  const digitInputs = page.locator('input[type="tel"]');
  await expect(digitInputs).toHaveCount(6);
  for (let i = 0; i < PIN.length; i++) {
    await digitInputs.nth(i).fill(PIN[i]);
  }

  await expect(page).toHaveURL(/\/$/);
}

test("logging in with the correct PIN, asking a question, and logging out", async ({ page }) => {
  await login(page);

  await page.route("**/api/query", (route) => route.fulfill({ json: FIXTURE_RESPONSE }));

  const askButton = page.getByRole("button", { name: "Ask" });
  await page.getByRole("textbox").fill("Where was I yesterday?");
  await askButton.click();

  await expect(page.getByText(FIXTURE_RESPONSE.summary)).toBeVisible();
  await expect(page.getByText("Capitol Hill", { exact: true })).toBeVisible();
  await expect(page.locator(".leaflet-container")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("an incorrect PIN is rejected and the digits are cleared", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  const digitInputs = page.locator('input[type="tel"]');
  for (let i = 0; i < 6; i++) {
    await digitInputs.nth(i).fill("0");
  }

  await expect(page.getByText("Incorrect PIN")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});
