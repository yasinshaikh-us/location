import { test, expect } from "@playwright/test";

// Layer 1 of the synthetic-monitoring framework: unauthenticated black-box
// checks against a real, already-deployed instance of the app (see
// playwright.synthetic.config.ts — baseURL comes from SYNTHETIC_BASE_URL).
// These need no Supabase/Anthropic/Google credentials at all, so they can
// run on a schedule right away. Layers 2 (authenticated NL queries +
// date-range correctness, including the DST-sensitive formatDateTime bug in
// lib/format.ts) and 3 (direct Supabase cross-checks) live in the sibling
// auth-queries.spec.ts / db-crosscheck.spec.ts files, not yet implemented.

test("an unauthenticated visitor is redirected to /login and sees the Google sign-in option", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
});

test("/api/health reports every required env var as set", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = await res.json();
  for (const [key, value] of Object.entries(body.env)) {
    expect(value, `${key} should be "set"`).toBe("set");
  }
});

test("/api/query 401s without a session instead of silently redirecting", async ({ request }) => {
  const res = await request.post("/api/query", {
    data: { question: "where was I yesterday" },
  });
  expect(res.status()).toBe(401);
});

test("a protected page (not just the API) redirects an unauthenticated visitor", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});
