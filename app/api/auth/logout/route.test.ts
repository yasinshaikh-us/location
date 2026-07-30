import { describe, it, expect, vi } from "vitest";

const mockSignOut = vi.fn();
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: () => ({
    auth: { signOut: mockSignOut },
  }),
}));

import { POST } from "./route";

describe("POST /api/auth/logout", () => {
  it("signs the user out via Supabase and returns ok", async () => {
    mockSignOut.mockResolvedValue({ error: null });

    const res = await POST();

    expect(mockSignOut).toHaveBeenCalled();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });
});
