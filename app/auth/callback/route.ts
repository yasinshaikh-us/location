import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

// Google redirects here with a `code` param after the user approves
// sign-in; exchanging it for a session sets the auth cookies that
// proxy.ts and every server-side Supabase client then read.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const rawNext = req.nextUrl.searchParams.get("next");
  // Only allow same-site relative paths so this can't be used as an open
  // redirect (e.g. `next=https://evil.example` or `next=//evil.example`).
  const next =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/";

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, req.url));
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth", req.url));
}
