import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

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

  let dbStatus = "unknown";
  try {
    const supabase = getSupabaseServerClient();
    const { count, error } = await supabase
      .from("location_pings")
      .select("*", { count: "exact", head: true });
    dbStatus = error ? `error: ${error.message}` : `ok (${count} rows)`;
  } catch (e) {
    dbStatus = `error: ${e instanceof Error ? e.message : "unknown"}`;
  }

  return NextResponse.json({ env: checks, database: dbStatus });
}
