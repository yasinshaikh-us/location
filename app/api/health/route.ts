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
  checks.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? "set"
    : "MISSING";
  checks.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? "set"
    : "MISSING";
  checks.MAPBOX_TOKEN = process.env.MAPBOX_TOKEN ? "set" : "MISSING";

  const dbStatus = await checkDatabaseConnectivity();

  return NextResponse.json({ env: checks, database: dbStatus });
}
