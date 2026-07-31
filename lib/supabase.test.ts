import { describe, it, expect } from "vitest";
import { fetchPingsInRange } from "./supabase";

// Fake query builder: deliberately exposes only the read methods this app's
// code is allowed to call (select/gte/lte/order/limit). It does NOT expose
// insert/update/delete/upsert/rpc — if fetchPingsInRange ever grew a write
// call, this mock would throw "not a function" rather than silently
// succeeding, which is the regression guard for the "read-only by
// construction" guarantee documented in lib/supabase.ts.
function makeQueryBuilder(result: { data?: unknown; error?: unknown }) {
  const calls: Record<string, unknown[]> = {};
  const builder: PromiseLike<typeof result> & Record<string, (...args: unknown[]) => unknown> = {
    select: (...args: unknown[]) => {
      calls.select = args;
      return builder;
    },
    gte: (...args: unknown[]) => {
      calls.gte = args;
      return builder;
    },
    lte: (...args: unknown[]) => {
      calls.lte = args;
      return builder;
    },
    order: (...args: unknown[]) => {
      calls.order = args;
      return builder;
    },
    limit: (...args: unknown[]) => {
      calls.limit = args;
      return builder;
    },
    then: (resolve: (v: typeof result) => unknown) => resolve(result),
  } as never;
  return { builder, calls };
}

describe("fetchPingsInRange", () => {
  it("queries location_pings with the requested range, ascending order, and the 20k safety cap, using the client it's given", async () => {
    const { builder, calls } = makeQueryBuilder({ data: [], error: null });
    const fakeClient = { from: () => builder } as never;

    await fetchPingsInRange(fakeClient, "2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z");

    expect(calls.select[0]).toBe("id, tid, tst, lat, lon, alt, acc, vel, batt, conn");
    expect(calls.gte).toEqual(["tst", "2026-01-01T00:00:00Z"]);
    expect(calls.lte).toEqual(["tst", "2026-01-02T00:00:00Z"]);
    expect(calls.order).toEqual(["tst", { ascending: true }]);
    expect(calls.limit).toEqual([20000]);
  });

  it("returns the rows as-is when the query succeeds", async () => {
    const rows = [{ id: 1, tid: "t1", tst: "2026-01-01T00:00:00Z", lat: 47.6, lon: -122.3 }];
    const { builder } = makeQueryBuilder({ data: rows, error: null });
    const fakeClient = { from: () => builder } as never;

    const result = await fetchPingsInRange(fakeClient, "2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z");
    expect(result).toEqual(rows);
  });

  it("returns an empty array when data is null", async () => {
    const { builder } = makeQueryBuilder({ data: null, error: null });
    const fakeClient = { from: () => builder } as never;

    const result = await fetchPingsInRange(fakeClient, "2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z");
    expect(result).toEqual([]);
  });

  it("throws with the Supabase error message on query failure", async () => {
    const { builder } = makeQueryBuilder({ data: null, error: { message: "connection refused" } });
    const fakeClient = { from: () => builder } as never;

    await expect(
      fetchPingsInRange(fakeClient, "2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z")
    ).rejects.toThrow("Supabase query failed: connection refused");
  });
});
