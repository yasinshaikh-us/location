import { describe, it, expect } from "vitest";
import { POST } from "./route";

describe("POST /api/auth/logout", () => {
  it("clears the session cookie", async () => {
    const res = await POST();
    expect(res.status).toBe(200);

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("lt_session=");
    expect(setCookie).toContain("Max-Age=0");

    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });
});
