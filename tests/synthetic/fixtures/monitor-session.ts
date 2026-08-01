import { createServerClient, type CookieOptions } from "@supabase/ssr";

export interface MonitorSession {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

interface CapturedCookie {
  name: string;
  value: string;
  options: CookieOptions;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set to run authenticated synthetic tests`);
  return value;
}

// Signs in as the dedicated synthetic-monitoring Supabase user (created
// once, out-of-band, via the Admin API) via the same password grant the
// app itself would use — no service-role key involved here.
export async function signIn(): Promise<MonitorSession> {
  const url = requireEnv("MONITOR_SUPABASE_URL");
  const anonKey = requireEnv("MONITOR_SUPABASE_ANON_KEY");
  const email = requireEnv("MONITOR_USER_EMAIL");
  const password = requireEnv("MONITOR_USER_PASSWORD");

  const resp = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!resp.ok) {
    throw new Error(`Monitoring account sign-in failed: ${resp.status} ${await resp.text()}`);
  }
  const session = await resp.json();
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    userId: session.user.id,
  };
}

// Runs the session through the app's own auth library (@supabase/ssr)
// server-side, capturing the exact cookies a real sign-in would set,
// instead of hand-rolling @supabase/ssr's cookie name/chunking/encoding —
// this keeps working across @supabase/ssr version upgrades unattended.
export async function sessionToCookies(session: MonitorSession): Promise<CapturedCookie[]> {
  const url = requireEnv("MONITOR_SUPABASE_URL");
  const anonKey = requireEnv("MONITOR_SUPABASE_ANON_KEY");
  const captured: CapturedCookie[] = [];

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => [],
      setAll: (cookiesToSet) => {
        for (const { name, value, options } of cookiesToSet) {
          captured.push({ name, value, options: options ?? {} });
        }
      },
    },
  });

  await supabase.auth.setSession({
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
  });

  return captured;
}

// Converts captured @supabase/ssr cookie descriptors into the shape
// Playwright's BrowserContext.addCookies expects.
export function cookiesForContext(cookies: CapturedCookie[], baseUrl: string) {
  const domain = new URL(baseUrl).hostname;
  return cookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain,
    path: c.options.path ?? "/",
    httpOnly: c.options.httpOnly ?? true,
    secure: true,
    sameSite: (c.options.sameSite as "Lax" | "Strict" | "None" | undefined) ?? "Lax",
  }));
}

function restHeaders(session: MonitorSession) {
  return {
    apikey: requireEnv("MONITOR_SUPABASE_ANON_KEY"),
    Authorization: `Bearer ${session.accessToken}`,
    "Content-Type": "application/json",
  };
}

// Inserts fixture pings as the monitoring user (RLS-scoped to their own
// user_id). `raw` is NOT NULL in the schema (it normally holds the
// original OwnTracks payload) — a small synthetic marker object satisfies
// that without implying this came from a real device.
export async function insertPings(
  session: MonitorSession,
  pings: Array<{ tst: string; lat: number; lon: number }>
) {
  const url = requireEnv("MONITOR_SUPABASE_URL");
  const resp = await fetch(`${url}/rest/v1/location_pings`, {
    method: "POST",
    headers: { ...restHeaders(session), Prefer: "return=representation" },
    body: JSON.stringify(pings.map((p) => ({ ...p, raw: { synthetic: true }, user_id: session.userId }))),
  });
  if (!resp.ok) throw new Error(`Fixture insert failed: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

// Deletes every ping owned by the monitoring user — used before and after
// each test so a crashed prior run can't leave stale fixture rows behind.
export async function deleteAllPings(session: MonitorSession) {
  const url = requireEnv("MONITOR_SUPABASE_URL");
  const resp = await fetch(`${url}/rest/v1/location_pings?user_id=eq.${session.userId}`, {
    method: "DELETE",
    headers: restHeaders(session),
  });
  if (!resp.ok) throw new Error(`Fixture cleanup failed: ${resp.status} ${await resp.text()}`);
}
