// Uses the Web Crypto API (globalThis.crypto.subtle) rather than
// Node's `crypto` module, because Next.js middleware runs on the Edge
// runtime, which only has Web Crypto available. This same module is
// also used from the (Node-runtime) login API route, so one
// implementation covers both.

const COOKIE_NAME = "lt_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("Missing SESSION_SECRET env var");
  }
  return secret;
}

async function hmacHex(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function createSessionToken(): Promise<string> {
  const expiry = Date.now() + SESSION_DURATION_MS;
  const mac = await hmacHex(String(expiry), getSecret());
  return `${expiry}.${mac}`;
}

export async function verifySessionToken(
  token: string | undefined | null
): Promise<boolean> {
  if (!token) return false;
  const [expiryStr, mac] = token.split(".");
  if (!expiryStr || !mac) return false;

  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;

  const expectedMac = await hmacHex(expiryStr, getSecret());
  return timingSafeEqualStr(mac, expectedMac);
}

export function verifyPin(candidate: string): boolean {
  const realPin = process.env.SITE_PIN;
  if (!realPin) {
    throw new Error("Missing SITE_PIN env var");
  }
  // Trim whitespace/newlines on both sides — env vars shared across
  // multiple Vercel projects can pick up trailing whitespace depending
  // on how they were set, and this should still match cleanly.
  return timingSafeEqualStr(candidate.trim(), realPin.trim());
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
export const SESSION_MAX_AGE_SECONDS = SESSION_DURATION_MS / 1000;
