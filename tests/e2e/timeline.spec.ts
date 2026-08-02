import { test, expect } from "@playwright/test";

// Auth is now Google OAuth via Supabase (see proxy.ts, app/login,
// app/auth/callback) instead of a PIN this repo controlled end-to-end.
// A real "Continue with Google" flow can't be driven headlessly here —
// it requires a real Google account plus Supabase's OAuth redirect, which
// this smoke test has no credentials for. So this file only covers the
// logged-out gate (redirect + the login screen itself); exercising the
// authenticated app (asking a question, viewing the map, signing out) is
// follow-up work — either a real test Google account driven via Playwright
// storageState, or an admin-created Supabase session injected directly.

test("an unauthenticated visitor is redirected to /login and sees the Google sign-in option", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("button", { name: "Continue with Google" })
  ).toBeVisible();
});

test("/api/query 401s without a session instead of silently redirecting", async ({
  request,
}) => {
  const res = await request.post("/api/query", {
    data: { question: "where was I yesterday" },
  });
  expect(res.status()).toBe(401);
});
