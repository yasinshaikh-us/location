import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { verifySessionToken } from "@/lib/auth";

// Exercises the route against the real lib/auth implementation (already
// unit-tested in lib/auth.test.ts) rather than mocking it — this is a thin
// route, so the value here is end-to-end: does a correct PIN actually
// produce a cookie that lib/auth itself accepts?
function loginRequest(body: unknown) {
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
  const realEnv = { ...process.env };

  beforeEach(() => {
    process.env.SITE_PIN = "482196";
    process.env.SESSION_SECRET = "test-session-secret";
  });
  afterEach(() => {
    process.env = { ...realEnv };
  });

  it("400s when the PIN is missing from the body", async () => {
    const res = await POST(loginRequest({}));
    expect(res.status).toBe(400);
  });

  it("401s with a generic error on an incorrect PIN", async () => {
    const res = await POST(loginRequest({ pin: "000000" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Incorrect PIN");
  });

  it("issues a session cookie that lib/auth itself verifies as valid, on a correct PIN", async () => {
    const res = await POST(loginRequest({ pin: "482196" }));
    expect(res.status).toBe(200);

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("lt_session=");
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
    expect(setCookie).toContain("Max-Age=2592000"); // 30 days in seconds

    const token = res.cookies.get("lt_session")?.value;
    expect(await verifySessionToken(token)).toBe(true);
  });
});
