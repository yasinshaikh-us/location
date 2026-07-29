import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// Routes that must remain reachable without a session: the PIN screen
// itself, and the health check (booleans/lengths only, no secrets —
// kept public specifically so it's usable to diagnose a broken login).
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/health"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const isValid = await verifySessionToken(token);

  if (isValid) {
    return NextResponse.next();
  }

  // API routes get a 401 JSON response — this is the part that actually
  // matters, since a client-side-only redirect would leave /api/query
  // callable directly regardless of what the UI shows.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Page routes get redirected to the PIN screen.
  const loginUrl = new URL("/login", req.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Run on everything except Next's internal assets — matching those
  // explicitly (rather than a broad catch-all) avoids breaking image
  // optimization, fonts, etc.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
