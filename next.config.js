// Content-Security-Policy source allowlist, spelled out per-directive so
// each origin's reason for being here is traceable:
// - 'unsafe-inline' on script/style: the blocking theme-init <Script> in
//   layout.tsx and Mapbox GL's injected <style> tags aren't served from a
//   file Next can attach a nonce to. A nonce-based CSP would remove this,
//   but adds real complexity (threading a per-request nonce through
//   proxy.ts's several early-return branches) for a personal app —
//   noted here as a follow-up worth doing if this app's threat model ever
//   changes.
// - api.mapbox.com / events.mapbox.com / *.tiles.mapbox.com: Mapbox GL JS
//   fetches its style/sprite/glyphs and tiles from these, and reports
//   anonymous usage telemetry to events.mapbox.com.
// - *.supabase.co: the browser Supabase client (lib/supabase-browser.ts)
//   only ever redirects to Google's OAuth screen today (no client-side
//   fetch), but this is kept as a forward-looking allowance rather than
//   a hard dependency on today's exact call pattern.
// - worker-src/child-src blob:: Mapbox GL loads its own workers from
//   blob: URLs.
// Reverse geocoding (Nominatim) runs server-side in app/api/query/route.ts,
// not from the browser, so it needs no browser CSP entry at all.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://*.tiles.mapbox.com https://api.mapbox.com",
  "font-src 'self' data:",
  "connect-src 'self' https://api.mapbox.com https://events.mapbox.com https://*.tiles.mapbox.com https://*.supabase.co",
  "worker-src 'self' blob:",
  "child-src blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  // Belt-and-suspenders alongside frame-ancestors above — CSP wins in
  // browsers that support it, this covers ones that don't.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // This app has no use for any of these browser APIs (verified: no
  // navigator.geolocation/mediaDevices/usb/bluetooth calls anywhere in
  // the codebase) — location data here comes from an ingested GPS log,
  // never the browser's own location API.
  { key: "Permissions-Policy", value: "geolocation=(), camera=(), microphone=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Inlined into the client bundle under its own name (rather than renaming
  // to NEXT_PUBLIC_MAPBOX_TOKEN) so it matches the MAPBOX_TOKEN env var
  // already configured in deployment environments.
  env: {
    MAPBOX_TOKEN: process.env.MAPBOX_TOKEN,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

module.exports = nextConfig;
