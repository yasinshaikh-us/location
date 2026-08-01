import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reverseGeocodeStops, mapboxProvider, type GeocodeProvider } from "./geocode";
import type { Stop } from "./simplify";

const baseStop: Stop = {
  lat: 47.6,
  lon: -122.3,
  arrival: "2026-01-01T00:00:00Z",
  departure: "2026-01-01T00:10:00Z",
  durationMinutes: 10,
  pingCount: 3,
  arrivalKnown: true,
  departureKnown: true,
};

type RpcHandler = (params: Record<string, unknown>) => { data: unknown; error: unknown };

function fakeSupabase(handlers: {
  nearestCachedPlace?: RpcHandler;
  cachePlace?: RpcHandler;
}): { client: SupabaseClient; rpc: ReturnType<typeof vi.fn> } {
  const rpc = vi.fn((fn: string, params: Record<string, unknown>) => {
    if (fn === "nearest_cached_place") {
      const result = handlers.nearestCachedPlace?.(params) ?? { data: [], error: null };
      return Promise.resolve(result);
    }
    if (fn === "cache_place") {
      const result = handlers.cachePlace?.(params) ?? { data: null, error: null };
      return Promise.resolve(result);
    }
    throw new Error(`unexpected rpc call: ${fn}`);
  });
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

function stubProvider(impl: (lat: number, lon: number) => Promise<string | undefined>): GeocodeProvider {
  return { reverseGeocode: vi.fn(impl) };
}

describe("reverseGeocodeStops", () => {
  beforeEach(() => {
    // reverseGeocodeStops sleeps briefly between real provider calls;
    // stub it to fire immediately so tests resolving many locations
    // (e.g. the budget test below) don't take real seconds to run.
    vi.stubGlobal("setTimeout", (fn: () => void) => {
      fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an empty array immediately, with no RPC calls, for no stops", async () => {
    const { client, rpc } = fakeSupabase({});
    const out = await reverseGeocodeStops(client, []);
    expect(out).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("uses the cached name and never calls the provider on a cache hit", async () => {
    const { client } = fakeSupabase({
      nearestCachedPlace: () => ({ data: [{ place_name: "Capitol Hill" }], error: null }),
    });
    const provider = stubProvider(async () => "should not be called");

    const [out] = await reverseGeocodeStops(client, [baseStop], provider);

    expect(out.placeName).toBe("Capitol Hill");
    expect(provider.reverseGeocode).not.toHaveBeenCalled();
  });

  it("calls the provider and writes the result back to the cache on a cache miss", async () => {
    const { client, rpc } = fakeSupabase({
      nearestCachedPlace: () => ({ data: [], error: null }),
      cachePlace: () => ({ data: null, error: null }),
    });
    const provider = stubProvider(async () => "Capitol Hill");

    const [out] = await reverseGeocodeStops(client, [baseStop], provider);

    expect(out.placeName).toBe("Capitol Hill");
    expect(provider.reverseGeocode).toHaveBeenCalledWith(baseStop.lat, baseStop.lon);
    expect(rpc).toHaveBeenCalledWith("cache_place", {
      p_lon: baseStop.lon,
      p_lat: baseStop.lat,
      p_place_name: "Capitol Hill",
    });
  });

  it("leaves placeName undefined, without writing to the cache, when the provider resolves nothing", async () => {
    const { client, rpc } = fakeSupabase({ nearestCachedPlace: () => ({ data: [], error: null }) });
    const provider = stubProvider(async () => undefined);

    const [out] = await reverseGeocodeStops(client, [baseStop], provider);

    expect(out.placeName).toBeUndefined();
    expect(rpc).not.toHaveBeenCalledWith("cache_place", expect.anything());
  });

  it("leaves placeName undefined when the provider throws, without crashing", async () => {
    const { client } = fakeSupabase({ nearestCachedPlace: () => ({ data: [], error: null }) });
    const provider = stubProvider(async () => {
      throw new Error("provider down");
    });

    const [out] = await reverseGeocodeStops(client, [baseStop], provider);
    expect(out.placeName).toBeUndefined();
  });

  it("still returns the resolved name even when the best-effort cache write fails", async () => {
    const { client } = fakeSupabase({
      nearestCachedPlace: () => ({ data: [], error: null }),
      cachePlace: () => ({ data: null, error: { message: "write failed" } }),
    });
    const provider = stubProvider(async () => "Capitol Hill");

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const [out] = await reverseGeocodeStops(client, [baseStop], provider);
    consoleError.mockRestore();

    expect(out.placeName).toBe("Capitol Hill");
  });

  it("resolves cache misses for a mix of already-cached and not-yet-cached stops independently", async () => {
    const cached = { ...baseStop, lat: 47.6, lon: -122.3 };
    const uncached = { ...baseStop, lat: 47.7, lon: -122.4 };
    const { client } = fakeSupabase({
      nearestCachedPlace: (params) =>
        params.p_lat === 47.6
          ? { data: [{ place_name: "Home" }], error: null }
          : { data: [], error: null },
      cachePlace: () => ({ data: null, error: null }),
    });
    const provider = stubProvider(async () => "Work");

    const out = await reverseGeocodeStops(client, [cached, uncached], provider);

    expect(out.map((s) => s.placeName)).toEqual(["Home", "Work"]);
    expect(provider.reverseGeocode).toHaveBeenCalledTimes(1);
    expect(provider.reverseGeocode).toHaveBeenCalledWith(47.7, -122.4);
  });

  it("dedupes repeat visits to (almost) the same place into a single cache lookup and a single provider call", async () => {
    const { client, rpc } = fakeSupabase({
      nearestCachedPlace: () => ({ data: [], error: null }),
      cachePlace: () => ({ data: null, error: null }),
    });
    const provider = stubProvider(async () => "Capitol Hill");

    const home = { ...baseStop, lat: 47.6, lon: -122.3 };
    // Close enough to bucket to the same in-request key (~111m precision).
    const homeAgain = { ...baseStop, lat: 47.6001, lon: -122.3001 };
    const out = await reverseGeocodeStops(client, [home, homeAgain, home], provider);

    expect(rpc.mock.calls.filter((c) => c[0] === "nearest_cached_place")).toHaveLength(1);
    expect(provider.reverseGeocode).toHaveBeenCalledTimes(1);
    expect(out.map((s) => s.placeName)).toEqual([
      "Capitol Hill",
      "Capitol Hill",
      "Capitol Hill",
    ]);
  });

  it("only resolves up to the per-request budget of new (uncached) locations, leaving the rest ungeocoded", async () => {
    const { client } = fakeSupabase({
      nearestCachedPlace: () => ({ data: [], error: null }),
      cachePlace: () => ({ data: null, error: null }),
    });
    const provider = stubProvider(async (lat) => `Place ${lat}`);

    // 41 stops, every one at a distinct location -- one more than the
    // 40-location budget.
    const manyStops = Array.from({ length: 41 }, (_, i) => ({ ...baseStop, lat: 47.6 + i }));
    const out = await reverseGeocodeStops(client, manyStops, provider);

    expect(provider.reverseGeocode).toHaveBeenCalledTimes(40);
    expect(out.filter((s) => s.placeName !== undefined)).toHaveLength(40);
    expect(out.filter((s) => s.placeName === undefined)).toHaveLength(1);
  });

  it("passes the query's lon/lat and STOP_RADIUS_METERS through to the cache lookup", async () => {
    const { client, rpc } = fakeSupabase({});
    await reverseGeocodeStops(client, [baseStop]);
    expect(rpc).toHaveBeenCalledWith("nearest_cached_place", {
      p_lon: baseStop.lon,
      p_lat: baseStop.lat,
      p_max_meters: 120,
    });
  });
});

describe("mapboxProvider.reverseGeocode", () => {
  const realFetch = global.fetch;
  const realToken = process.env.MAPBOX_TOKEN;

  beforeEach(() => {
    process.env.MAPBOX_TOKEN = "test-token";
  });

  afterEach(() => {
    global.fetch = realFetch;
    process.env.MAPBOX_TOKEN = realToken;
  });

  it("returns undefined without calling fetch when MAPBOX_TOKEN is unset", async () => {
    delete process.env.MAPBOX_TOKEN;
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const name = await mapboxProvider.reverseGeocode(47.6, -122.3);

    expect(name).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the first feature's short text", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        features: [{ text: "Capitol Hill", place_name: "Capitol Hill, Seattle, WA" }],
      }),
    })) as unknown as typeof fetch;

    expect(await mapboxProvider.reverseGeocode(47.6, -122.3)).toBe("Capitol Hill");
  });

  it("falls back to the first segment of place_name when text is missing", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ features: [{ place_name: "Capitol Hill, Seattle, WA" }] }),
    })) as unknown as typeof fetch;

    expect(await mapboxProvider.reverseGeocode(47.6, -122.3)).toBe("Capitol Hill");
  });

  it("returns undefined when there are no features", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ features: [] }),
    })) as unknown as typeof fetch;

    expect(await mapboxProvider.reverseGeocode(47.6, -122.3)).toBeUndefined();
  });

  it("returns undefined on a non-ok response", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;

    expect(await mapboxProvider.reverseGeocode(47.6, -122.3)).toBeUndefined();
  });

  it("requests lon,lat in that order (Mapbox's coordinate order, opposite of lat,lon)", async () => {
    const fetchMock = vi.fn(async (_url: string) => ({
      ok: true,
      json: async () => ({ features: [] }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await mapboxProvider.reverseGeocode(47.6, -122.3);

    expect(fetchMock.mock.calls[0][0]).toContain("/-122.3,47.6.json");
  });
});
