import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

function req(path: string, cookie?: string) {
  return new NextRequest(`http://x.test${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

function isPassthrough(res: Awaited<ReturnType<typeof middleware>>) {
  // NextResponse.next() carries this internal header and issues neither a
  // redirect nor an error status.
  return res.headers.get("x-middleware-next") === "1";
}

describe("middleware", () => {
  const realEnv = { ...process.env };

  beforeEach(() => {
    process.env.SESSION_SECRET = "test-session-secret";
  });
  afterEach(() => {
    process.env = { ...realEnv };
  });

  describe("public paths", () => {
    const publicPaths = [
      "/login",
      "/api/auth/login",
      "/api/health",
      "/manifest.webmanifest",
      "/icon",
      "/apple-icon",
      "/sw.js",
    ];

    it.each(publicPaths)("passes '%s' through without a session cookie", async (path) => {
      const res = await middleware(req(path));
      expect(isPassthrough(res)).toBe(true);
    });
  });

  describe("without a valid session", () => {
    it("redirects a page request to /login", async () => {
      const res = await middleware(req("/"));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://x.test/login");
    });

    it("401s an API request instead of redirecting (so a UI-only gate can't be bypassed by calling the API directly)", async () => {
      const res = await middleware(req("/api/query"));
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({ error: "Unauthorized" });
    });

    it("rejects a malformed cookie the same way as a missing one", async () => {
      const res = await middleware(req("/", `${SESSION_COOKIE_NAME}=garbage`));
      expect(res.status).toBe(307);
    });

    it("rejects an expired token even if otherwise well-formed", async () => {
      const expiry = Date.now() - 1000;
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
      const res = await middleware(req("/", `${SESSION_COOKIE_NAME}=${expiry}.${mac}`));
      expect(res.status).toBe(307);
    });
  });

  describe("with a valid session", () => {
    it("passes a page request through", async () => {
      const token = await createSessionToken();
      const res = await middleware(req("/", `${SESSION_COOKIE_NAME}=${token}`));
      expect(isPassthrough(res)).toBe(true);
    });

    it("passes an API request through", async () => {
      const token = await createSessionToken();
      const res = await middleware(req("/api/query", `${SESSION_COOKIE_NAME}=${token}`));
      expect(isPassthrough(res)).toBe(true);
    });
  });
});
