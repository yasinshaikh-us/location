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

  it("reports every required env var as set (never the PIN's value or length)", async () => {
    process.env.ANTHROPIC_API_KEY = "x";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "x";
    process.env.SESSION_SECRET = "x";
    process.env.SITE_PIN = "482196";
    mockCheckDatabaseConnectivity.mockResolvedValue("ok (12 rows)");

    const res = await GET();
    const body = await res.json();

    expect(body.env).toEqual({
      ANTHROPIC_API_KEY: "set",
      SUPABASE_URL: "set",
      SUPABASE_SERVICE_ROLE_KEY: "set",
      SESSION_SECRET: "set",
      SITE_PIN: "set",
    });
    expect(body.env.SITE_PIN).not.toContain("482196");
    expect(body.database).toBe("ok (12 rows)");
  });

  it("flags missing env vars individually", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SESSION_SECRET;
    delete process.env.SITE_PIN;
    mockCheckDatabaseConnectivity.mockResolvedValue("error: missing env vars");

    const res = await GET();
    const body = await res.json();

    expect(body.env).toEqual({
      ANTHROPIC_API_KEY: "MISSING",
      SUPABASE_URL: "MISSING",
      SUPABASE_SERVICE_ROLE_KEY: "MISSING",
      SESSION_SECRET: "MISSING",
      SITE_PIN: "MISSING",
    });
  });

  it("never reveals a length hint, even for a trailing-whitespace-corrupted PIN", async () => {
    process.env.SITE_PIN = "482196\n";
    mockCheckDatabaseConnectivity.mockResolvedValue("ok (0 rows)");

    const res = await GET();
    const body = await res.json();
    expect(body.env.SITE_PIN).toBe("set");
  });
});
