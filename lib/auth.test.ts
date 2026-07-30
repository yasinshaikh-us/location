import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createSessionToken,
  verifySessionToken,
  verifyPin,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "./auth";

describe("createSessionToken / verifySessionToken", () => {
  const realEnv = { ...process.env };

  beforeEach(() => {
    process.env.SESSION_SECRET = "test-session-secret";
  });
  afterEach(() => {
    process.env = { ...realEnv };
  });

  it("round-trips: a freshly created token verifies as valid", async () => {
    const token = await createSessionToken();
    expect(await verifySessionToken(token)).toBe(true);
  });

  it("rejects a missing token", async () => {
    expect(await verifySessionToken(null)).toBe(false);
    expect(await verifySessionToken(undefined)).toBe(false);
    expect(await verifySessionToken("")).toBe(false);
  });

  it("rejects a malformed token (no '.' separator)", async () => {
    expect(await verifySessionToken("not-a-real-token")).toBe(false);
  });

  it("rejects an expired token", async () => {
    const expiry = Date.now() - 1000;
    // Craft a token with a past expiry but otherwise well-formed.
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode("test-session-secret"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(String(expiry)));
    const mac = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(await verifySessionToken(`${expiry}.${mac}`)).toBe(false);
  });

  it("rejects a token whose MAC doesn't match (tampered expiry)", async () => {
    const token = await createSessionToken();
    const [, mac] = token.split(".");
    const futureExpiry = Date.now() + 1000 * 60 * 60 * 24 * 365; // tamper: extend expiry
    expect(await verifySessionToken(`${futureExpiry}.${mac}`)).toBe(false);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await createSessionToken();
    process.env.SESSION_SECRET = "a-different-secret";
    expect(await verifySessionToken(token)).toBe(false);
  });

  it("throws when SESSION_SECRET is missing", async () => {
    delete process.env.SESSION_SECRET;
    await expect(createSessionToken()).rejects.toThrow("Missing SESSION_SECRET");
  });
});

describe("verifyPin", () => {
  const realEnv = { ...process.env };

  beforeEach(() => {
    process.env.SITE_PIN = "482196";
  });
  afterEach(() => {
    process.env = { ...realEnv };
  });

  it("accepts the correct PIN", () => {
    expect(verifyPin("482196")).toBe(true);
  });

  it("rejects an incorrect PIN", () => {
    expect(verifyPin("000000")).toBe(false);
  });

  it("rejects a PIN that's a prefix/suffix of the real one", () => {
    expect(verifyPin("48219")).toBe(false);
    expect(verifyPin("4821960")).toBe(false);
  });

  it("trims whitespace on both the candidate and the stored PIN", () => {
    process.env.SITE_PIN = "  482196\n";
    expect(verifyPin(" 482196 ")).toBe(true);
  });

  it("throws when SITE_PIN is missing", () => {
    delete process.env.SITE_PIN;
    expect(() => verifyPin("482196")).toThrow("Missing SITE_PIN");
  });
});

describe("exported constants", () => {
  it("exposes the cookie name and max-age in seconds", () => {
    expect(SESSION_COOKIE_NAME).toBe("lt_session");
    expect(SESSION_MAX_AGE_SECONDS).toBe(60 * 60 * 24 * 30);
  });
});
