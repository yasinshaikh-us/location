import { defineConfig, devices } from "@playwright/test";

// One thin end-to-end smoke test (tier 3 of the test suite) — everything
// else is Vitest unit tests. Runs against a built+started copy of the app
// with /api/query mocked at the network layer, so it needs no real
// Anthropic/Supabase credentials — only a PIN + session secret so the
// real login flow (middleware.ts, lib/auth.ts) can be exercised for real.
const E2E_PORT = 4173;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    // The app registers a real service worker (public/sw.js, for PWA
    // installability) whose fetch handler re-issues requests from inside
    // the SW's own execution context — that bypasses page.route()
    // network mocking. Registration failure is non-fatal by design (see
    // RegisterServiceWorker.tsx), so blocking it here is safe and lets
    // /api/query mocking actually work.
    serviceWorkers: "block",
    // Set only for local runs against a pre-installed browser (e.g. this
    // sandbox); CI installs its own via `playwright install` and leaves
    // this unset.
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
      : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npm run start -- -p ${E2E_PORT}`,
    port: E2E_PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Real login flow needs these two; nothing else is ever reached
      // for real since /api/query is mocked at the network layer and
      // /api/health isn't visited by the smoke test.
      SITE_PIN: "123456",
      SESSION_SECRET: "e2e-test-session-secret-not-a-real-secret",
    },
  },
});
