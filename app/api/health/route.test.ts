import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockCheckDatabaseConnectivity } = vi.hoisted(() => ({
  mockCheckDatabaseConnectivity: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  checkDatabaseConnectivity: mockCheckDatabaseConnectivity,
}));

import { GET } from "./route";

describe("GET /api/health", () => {
  const realEnv = { ...process.env };

  beforeEach(() => {
    mockCheckDatabaseConnectivity.mockReset();
  });
  afterEach(() => {
    process.env = { ...realEnv };
  });

  it("reports every required env var as set", async () => {
    process.env.ANTHROPIC_API_KEY = "x";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "x";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "x";
    process.env.MAPBOX_TOKEN = "x";
    mockCheckDatabaseConnectivity.mockResolvedValue("ok (12 rows)");

    const res = await GET();
    const body = await res.json();

    expect(body.env).toEqual({
      ANTHROPIC_API_KEY: "set",
      SUPABASE_URL: "set",
      SUPABASE_SERVICE_ROLE_KEY: "set",
      NEXT_PUBLIC_SUPABASE_URL: "set",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "set",
      MAPBOX_TOKEN: "set",
    });
    expect(body.database).toBe("ok (12 rows)");
  });

  it("flags missing env vars individually", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.MAPBOX_TOKEN;
    mockCheckDatabaseConnectivity.mockResolvedValue("error: missing env vars");

    const res = await GET();
    const body = await res.json();

    expect(body.env).toEqual({
      ANTHROPIC_API_KEY: "MISSING",
      SUPABASE_URL: "MISSING",
      SUPABASE_SERVICE_ROLE_KEY: "MISSING",
      NEXT_PUBLIC_SUPABASE_URL: "MISSING",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "MISSING",
      MAPBOX_TOKEN: "MISSING",
    });
  });
});
