import { describe, it, expect, afterEach } from "vitest";
import { GET } from "./route";

describe("GET /api/health", () => {
  const realEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...realEnv };
  });

  it("reports every required env var as set", async () => {
    process.env.ANTHROPIC_API_KEY = "x";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "x";
    process.env.MAPBOX_TOKEN = "x";

    const res = await GET();
    const body = await res.json();

    expect(body.env).toEqual({
      ANTHROPIC_API_KEY: "set",
      NEXT_PUBLIC_SUPABASE_URL: "set",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "set",
      MAPBOX_TOKEN: "set",
    });
  });

  it("flags missing env vars individually", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.MAPBOX_TOKEN;

    const res = await GET();
    const body = await res.json();

    expect(body.env).toEqual({
      ANTHROPIC_API_KEY: "MISSING",
      NEXT_PUBLIC_SUPABASE_URL: "MISSING",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "MISSING",
      MAPBOX_TOKEN: "MISSING",
    });
  });
});
