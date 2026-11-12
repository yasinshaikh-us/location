import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockExchange = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { exchangeCodeForSession: mockExchange },
  }),
}));

import { GET } from "./route";

const BASE = "https://app.example";
const call = (qs: string) => GET(new NextRequest(`${BASE}/auth/callback${qs}`));

describe("GET /auth/callback", () => {
  beforeEach(() => mockExchange.mockReset().mockResolvedValue({ error: null }));

  it("redirects to / after a successful exchange", async () => {
    const res = await call("?code=abc");
    expect(res.headers.get("location")).toBe(`${BASE}/`);
  });

  it("honours a same-site next path", async () => {
    const res = await call("?code=abc&next=" + encodeURIComponent("/history?x=1"));
    expect(res.headers.get("location")).toBe(`${BASE}/history?x=1`);
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "/\t/evil.example"])(
    "never redirects off-site for next=%s",
    async (next) => {
      const res = await call("?code=abc&next=" + encodeURIComponent(next));
      expect(new URL(res.headers.get("location")!).origin).toBe(BASE);
    }
  );

  it("sends a failed exchange back to login with an error", async () => {
    mockExchange.mockResolvedValue({ error: new Error("bad") });
    const res = await call("?code=abc");
    expect(res.headers.get("location")).toBe(`${BASE}/login?error=auth`);
  });

  it("sends a missing code back to login with an error", async () => {
    const res = await call("");
    expect(res.headers.get("location")).toBe(`${BASE}/login?error=auth`);
  });
});
