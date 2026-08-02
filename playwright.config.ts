import { defineConfig, devices } from "@playwright/test";

// One thin end-to-end smoke test (tier 3 of the test suite) — everything
// else is Vitest unit tests. Only covers the logged-out gate (redirect to
// /login, the Google sign-in button, /api/query 401ing) — the real Google
// OAuth flow needs a live Google account and can't be driven headlessly
// with credentials this repo controls (see tests/e2e/timeline.spec.ts).
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
      // proxy.ts needs a syntactically valid Supabase URL/key to
      // construct its client; since there's never a session cookie in
      // this smoke test, auth.getUser() resolves to no-user locally
      // without an actual network round-trip, so these values never need
      // to be real.
      NEXT_PUBLIC_SUPABASE_URL: "https://e2e-test-project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-test-anon-key-not-real",
      // Needed at build time so MapView's client bundle has a token to read
      // (see next.config.js). The smoke test never reaches the map, so an
      // invalid token is fine.
      MAPBOX_TOKEN: "pk.e2e-test-token-not-real",
    },
  },
});
