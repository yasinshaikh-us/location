import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetUser = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: mockGetUser },
  }),
}));

import { proxy } from "./proxy";

function req(path: string) {
  return new NextRequest(`http://x.test${path}`);
}

function isPassthrough(res: Awaited<ReturnType<typeof proxy>>) {
  // NextResponse.next() carries this internal header and issues neither a
  // redirect nor an error status.
  return res.headers.get("x-middleware-next") === "1";
}

describe("middleware", () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  });

  describe("public paths", () => {
    const publicPaths = [
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

    it.each(publicPaths)("passes '%s' through without a signed-in user", async (path) => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const res = await proxy(req(path));
      expect(isPassthrough(res)).toBe(true);
    });
  });

  describe("path matching is exact, not prefix-based", () => {
    it("does not treat a route that merely shares a public path's prefix as public", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const res = await proxy(req("/icon-not-actually-public"));
      expect(res.status).toBe(307);
    });

    it("still redirects a nested, non-whitelisted path under a public-looking prefix", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const res = await proxy(req("/api/healthcheck-internal"));
      expect(res.status).toBe(401);
    });
  });

  describe("without a signed-in user", () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
    });

    it("redirects a page request to /login", async () => {
      const res = await proxy(req("/"));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://x.test/login");
    });

    it("401s an API request instead of redirecting (so a UI-only gate can't be bypassed by calling the API directly)", async () => {
      const res = await proxy(req("/api/query"));
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({ error: "Unauthorized" });
    });
  });

  describe("with a signed-in user", () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    });

    it("passes a page request through", async () => {
      const res = await proxy(req("/"));
      expect(isPassthrough(res)).toBe(true);
    });

    it("passes an API request through", async () => {
      const res = await proxy(req("/api/query"));
      expect(isPassthrough(res)).toBe(true);
    });
  });
});
