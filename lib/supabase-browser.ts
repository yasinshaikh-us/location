"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client used only to kick off the Google OAuth
// redirect from the login page. Uses the publishable/anon key, which is
// safe to expose to the browser by design — it has no access beyond
// what RLS grants to the `anon`/`authenticated` roles.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
