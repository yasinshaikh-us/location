import { NextResponse } from "next/server";
import { checkDatabaseConnectivity } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  const checks: Record<string, string> = {};

  checks.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
    ? "set"
    : "MISSING";
  checks.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? "set"
    : "MISSING";
  checks.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? "set"
    : "MISSING";
  checks.SESSION_SECRET = process.env.SESSION_SECRET ? "set" : "MISSING";

  // Report presence only, never the PIN's value or even its length — this
  // endpoint is intentionally reachable without a session (see
  // middleware.ts), and login attempts are now rate-limited, so leaking
  // the PIN's length here would hand an unauthenticated caller a smaller
  // brute-force search space for free.
  checks.SITE_PIN = process.env.SITE_PIN ? "set" : "MISSING";

  const dbStatus = await checkDatabaseConnectivity();

  return NextResponse.json({ env: checks, database: dbStatus });
}
