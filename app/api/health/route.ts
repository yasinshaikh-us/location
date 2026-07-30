import { NextResponse } from "next/server";
import { checkDatabaseConnectivity } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  const checks: Record<string, string> = {};

  checks.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
    ? "set"
    : "MISSING";
  checks.SUPABASE_URL = process.env.SUPABASE_URL ? "set" : "MISSING";
  checks.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? "set"
    : "MISSING";
  checks.SESSION_SECRET = process.env.SESSION_SECRET ? "set" : "MISSING";

  // Report length only, never the actual PIN — but the length alone is
  // enough to catch trailing whitespace/newlines (e.g. "6" expected,
  // "7" means something snuck in).
  checks.SITE_PIN = process.env.SITE_PIN
    ? `set (length ${process.env.SITE_PIN.length})`
    : "MISSING";

  const dbStatus = await checkDatabaseConnectivity();

  return NextResponse.json({ env: checks, database: dbStatus });
}
