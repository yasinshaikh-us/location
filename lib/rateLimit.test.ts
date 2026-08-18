import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkQueryRateLimit } from "./rateLimit";

function fakeSupabase(result: { data: unknown; error: unknown }): {
  client: SupabaseClient;
  rpc: ReturnType<typeof vi.fn>;
} {
  const rpc = vi.fn(() => Promise.resolve(result));
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe("checkQueryRateLimit", () => {
  it("calls the RPC with the caller's own session-bound client", async () => {
    const { client, rpc } = fakeSupabase({ data: [{ allowed: true, retry_after_seconds: 0 }], error: null });
    await checkQueryRateLimit(client);
    expect(rpc).toHaveBeenCalledWith("check_and_increment_query_rate_limit");
  });

  it("returns allowed: true when under the limit", async () => {
    const { client } = fakeSupabase({ data: [{ allowed: true, retry_after_seconds: 0 }], error: null });
    await expect(checkQueryRateLimit(client)).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it("returns allowed: false with a positive retryAfterSeconds when over the limit", async () => {
    const { client } = fakeSupabase({ data: [{ allowed: false, retry_after_seconds: 42 }], error: null });
    await expect(checkQueryRateLimit(client)).resolves.toEqual({ allowed: false, retryAfterSeconds: 42 });
  });

  it("throws with the Supabase error message on failure", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: "boom" } });
    await expect(checkQueryRateLimit(client)).rejects.toThrow(/boom/);
  });
});
