// Keeps this project's Supabase database out of Supabase's free-tier
// 7-day-inactivity auto-pause, independent of anything else in this repo
// actually running. synthetic-monitor.yml's `authenticated` job is the
// only other thing here that touches Supabase with real credentials, and
// it's workflow_dispatch-only by design (bounded cost/blast radius) --
// not a reliable clock against a 7-day window on its own. See
// .github/workflows/supabase-keepalive.yml for the schedule.
//
// Reuses the same dedicated monitoring account and env vars as
// tests/synthetic/fixtures/monitor-session.ts's signIn(), but as a plain
// standalone script: no Playwright/browser needed for a bare REST round
// trip, and no new secrets beyond what synthetic-monitor.yml already uses.

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

async function main() {
  const url = requireEnv("MONITOR_SUPABASE_URL");
  const anonKey = requireEnv("MONITOR_SUPABASE_ANON_KEY");
  const email = requireEnv("MONITOR_USER_EMAIL");
  const password = requireEnv("MONITOR_USER_PASSWORD");

  const signInResp = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!signInResp.ok) {
    throw new Error(`Sign-in failed: ${signInResp.status} ${await signInResp.text()}`);
  }
  const { access_token: accessToken } = await signInResp.json();

  // A real, authenticated PostgREST query -- exactly the kind of activity
  // Supabase's inactivity check looks for, not just a health-check ping
  // against some surface that never touches the database itself.
  const queryResp = await fetch(`${url}/rest/v1/location_pings?select=id&limit=1`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
  });
  if (!queryResp.ok) {
    throw new Error(`Keep-alive query failed: ${queryResp.status} ${await queryResp.text()}`);
  }

  console.log("Supabase keep-alive: signed in and queried location_pings successfully.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
