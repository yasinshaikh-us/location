import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Request-scoped Supabase client for use inside Server Components, Route
// Handlers, and Server Actions. Bound to the incoming request's cookies,
// so it carries the signed-in user's session — queries made through it
// run as that user (`auth.uid()`), and Postgres RLS does the actual
// per-user filtering on location_pings. This deliberately does NOT use
// the service-role key: unlike the health-check-only client in
// lib/supabase.ts, anything built on this client is meant to only ever
// see the calling user's own rows.
export function createServerSupabaseClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component render, where cookies can't
            // be written — safe to ignore since middleware refreshes the
            // session on every request anyway.
          }
        },
      },
    }
  );
}
