import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Routes that must remain reachable without a session: the login screen
// itself, the OAuth callback (which is how a session gets created in the
// first place), the health check (booleans only, no secrets — kept
// public specifically so it's usable to diagnose a broken login), and
// the PWA install assets. The manifest/icons/service worker have to be
// fetchable from the unauthenticated /login screen too — that's the only
// page a browser can see before first login, so if these 401 or
// redirect, the app never gets flagged as installable. None of them
// expose anything beyond the app's name/branding.
//
// Every entry here is matched exactly (no prefix/startsWith matching) —
// a prefix match would let any future route sharing one of these
// prefixes (e.g. a hypothetical "/api/healthcheck-internal") silently
// bypass auth. Each of the manifest's icon sources is listed individually
// for the same reason.
const PUBLIC_PATHS = [
  "/login",
  "/auth/callback",
  "/api/health",
  "/manifest.webmanifest",
  "/icon",
  "/apple-icon",
  "/icons/512",
  "/icons/192",
  "/icons/maskable",
  "/sw.js",
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  let res = NextResponse.next({ request: req });

  // This client both reads the session cookie and, if the access token
  // is near expiry, transparently refreshes it — the refreshed cookies
  // get written onto `res` via setAll below so the browser picks up the
  // new token. This has to run before the public-path early return so a
  // signed-in user's session keeps refreshing even while browsing public
  // pages like /login.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (PUBLIC_PATHS.some((p) => pathname === p)) {
    return res;
  }

  if (user) {
    return res;
  }

  // API routes get a 401 JSON response — this is the part that actually
  // matters, since a client-side-only redirect would leave /api/query
  // callable directly regardless of what the UI shows.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Page routes get redirected to the login screen.
  const loginUrl = new URL("/login", req.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Run on everything except Next's internal assets — matching those
  // explicitly (rather than a broad catch-all) avoids breaking image
  // optimization, fonts, etc.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
