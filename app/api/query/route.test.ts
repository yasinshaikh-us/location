import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { LocationPing } from "@/lib/supabase";
import type { Stop, RoutePoint } from "@/lib/simplify";
import { pacificDayBoundsUtc } from "@/lib/format";

// The query route is a pure orchestrator over lib/supabase, lib/anthropic,
// and lib/simplify — each already has its own unit tests, so here we mock
// all three at the module boundary and test only this route's own logic:
// guard clauses, the reverse-geocode skip-if->15-stops rule, and how the
// pieces get assembled into the response body / GeoJSON.
const mockFetchPingsInRange = vi.fn();
vi.mock("@/lib/supabase", () => ({
  fetchPingsInRange: (...args: unknown[]) => mockFetchPingsInRange(...args),
}));

const FAKE_SUPABASE_CLIENT = { from: vi.fn() };
const mockCreateServerSupabaseClient = vi.fn(() => FAKE_SUPABASE_CLIENT);
vi.mock("@/lib/supabase-server", () => ({
  createServerSupabaseClient: () => mockCreateServerSupabaseClient(),
}));

const mockParseDateRangeFromQuestion = vi.fn();
const mockSummarizeStops = vi.fn();
vi.mock("@/lib/anthropic", () => ({
  parseDateRangeFromQuestion: (...args: unknown[]) => mockParseDateRangeFromQuestion(...args),
  summarizeStops: (...args: unknown[]) => mockSummarizeStops(...args),
}));

const mockClusterIntoStops = vi.fn();
const mockSimplifyRoute = vi.fn();
const mockReverseGeocodeStops = vi.fn();
vi.mock("@/lib/simplify", () => ({
  clusterIntoStops: (...args: unknown[]) => mockClusterIntoStops(...args),
  simplifyRoute: (...args: unknown[]) => mockSimplifyRoute(...args),
  reverseGeocodeStops: (...args: unknown[]) => mockReverseGeocodeStops(...args),
}));

import { POST } from "./route";

function queryRequest(body: unknown) {
  return new NextRequest("http://localhost/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const PING: LocationPing = {
  id: 1,
  tid: "phone1",
  tst: "2026-07-28T15:00:00Z",
  lat: 47.6,
  lon: -122.3,
  alt: null,
  acc: null,
  vel: null,
  batt: null,
  conn: null,
};

const STOP: Stop = {
  lat: 47.6,
  lon: -122.3,
  arrival: "2026-07-28T15:00:00Z",
  departure: "2026-07-28T15:20:00Z",
  durationMinutes: 20,
  pingCount: 3,
  placeName: "Capitol Hill",
};

const ROUTE_POINT: RoutePoint = { lat: 47.6, lon: -122.3, tst: "2026-07-28T15:00:00Z" };

describe("POST /api/query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchPingsInRange.mockResolvedValue([PING]);
    mockClusterIntoStops.mockReturnValue({ stops: [STOP], route: [ROUTE_POINT] });
    mockSimplifyRoute.mockReturnValue([ROUTE_POINT]);
    mockReverseGeocodeStops.mockImplementation(async (stops: Stop[]) => stops);
    mockSummarizeStops.mockResolvedValue("You were at Capitol Hill.");
    mockParseDateRangeFromQuestion.mockResolvedValue({
      isLocationQuery: true,
      start: "2026-07-28",
      end: "2026-07-28",
      reasoning: "yesterday",
    });
  });

  it("400s when 'question' is missing", async () => {
    const res = await POST(queryRequest({}));
    expect(res.status).toBe(400);
    expect(mockParseDateRangeFromQuestion).not.toHaveBeenCalled();
  });

  it("400s with the off-topic message when the question isn't a location query", async () => {
    mockParseDateRangeFromQuestion.mockResolvedValue({ isLocationQuery: false });
    const res = await POST(queryRequest({ question: "write me a poem" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/only answers questions about your own past location history/);
    expect(mockFetchPingsInRange).not.toHaveBeenCalled();
  });

  it("400s defensively when Claude returns start > end", async () => {
    mockParseDateRangeFromQuestion.mockResolvedValue({
      isLocationQuery: true,
      start: "2026-07-28",
      end: "2026-07-01",
    });
    const res = await POST(queryRequest({ question: "where was I" }));
    expect(res.status).toBe(400);
    expect(mockFetchPingsInRange).not.toHaveBeenCalled();
  });

  it("400s defensively on a malformed date (not YYYY-MM-DD)", async () => {
    mockParseDateRangeFromQuestion.mockResolvedValue({
      isLocationQuery: true,
      start: "not-a-date",
      end: "2026-07-28",
    });
    const res = await POST(queryRequest({ question: "where was I" }));
    expect(res.status).toBe(400);
  });

  it("converts the Pacific-time date range to UTC bounds before querying Supabase", async () => {
    await POST(queryRequest({ question: "where was I yesterday" }));

    const expectedStart = pacificDayBoundsUtc("2026-07-28").startIso;
    const expectedEnd = pacificDayBoundsUtc("2026-07-28").endIso;
    expect(mockFetchPingsInRange).toHaveBeenCalledWith(FAKE_SUPABASE_CLIENT, expectedStart, expectedEnd);
  });

  it("queries through a session-bound Supabase client, not a fresh one per call", async () => {
    await POST(queryRequest({ question: "where was I yesterday" }));
    expect(mockCreateServerSupabaseClient).toHaveBeenCalled();
  });

  it("reverse-geocodes when there's between 1 and 15 stops", async () => {
    await POST(queryRequest({ question: "where was I yesterday" }));
    expect(mockReverseGeocodeStops).toHaveBeenCalledWith([STOP]);
  });

  it("skips reverse geocoding when there are more than 15 stops", async () => {
    const manyStops = Array.from({ length: 16 }, (_, i) => ({ ...STOP, lat: 47.6 + i }));
    mockClusterIntoStops.mockReturnValue({ stops: manyStops, route: [ROUTE_POINT] });

    const res = await POST(queryRequest({ question: "where was I over the last month" }));
    expect(mockReverseGeocodeStops).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.stops).toHaveLength(16);
  });

  it("skips reverse geocoding when there are zero stops, and uses the no-data summary", async () => {
    mockClusterIntoStops.mockReturnValue({ stops: [], route: [] });
    mockSimplifyRoute.mockReturnValue([]);

    const res = await POST(queryRequest({ question: "where was I yesterday" }));
    expect(mockReverseGeocodeStops).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.summary).toBe(
      "No location data was recorded between 2026-07-28 and 2026-07-28. (yesterday)"
    );
  });

  it("assembles the response body: dateRange, summary, stops, route, geojson, tableRows", async () => {
    const res = await POST(queryRequest({ question: "where was I yesterday" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.dateRange).toEqual({ start: "2026-07-28", end: "2026-07-28" });
    expect(body.summary).toBe("You were at Capitol Hill.");
    expect(body.stops).toEqual([STOP]);
    expect(body.route).toEqual([ROUTE_POINT]);
    expect(body.tableRows).toEqual([
      {
        index: 1,
        place: "Capitol Hill",
        arrival: STOP.arrival,
        departure: STOP.departure,
        durationMinutes: STOP.durationMinutes,
        lat: STOP.lat,
        lon: STOP.lon,
      },
    ]);
  });

  it("builds one Point feature per stop, and skips the LineString feature for a single-point route", async () => {
    const res = await POST(queryRequest({ question: "where was I yesterday" }));
    const body = await res.json();

    expect(body.geojson.type).toBe("FeatureCollection");
    // route has only 1 point (simplifyRoute mocked to [ROUTE_POINT]) -> no LineString.
    expect(body.geojson.features.every((f: { geometry: { type: string } }) => f.geometry.type !== "LineString")).toBe(
      true
    );
    const pointFeature = body.geojson.features.find(
      (f: { geometry: { type: string } }) => f.geometry.type === "Point"
    );
    expect(pointFeature.geometry.coordinates).toEqual([STOP.lon, STOP.lat]);
    expect(pointFeature.properties.place).toBe("Capitol Hill");
  });

  it("includes a LineString feature when the simplified route has more than one point", async () => {
    const secondPoint: RoutePoint = { lat: 47.61, lon: -122.31, tst: "2026-07-28T15:05:00Z" };
    mockSimplifyRoute.mockReturnValue([ROUTE_POINT, secondPoint]);

    const res = await POST(queryRequest({ question: "where was I yesterday" }));
    const body = await res.json();

    const line = body.geojson.features.find((f: { geometry: { type: string } }) => f.geometry.type === "LineString");
    expect(line.geometry.coordinates).toEqual([
      [ROUTE_POINT.lon, ROUTE_POINT.lat],
      [secondPoint.lon, secondPoint.lat],
    ]);
  });

  it("labels a stop with no place name using its coordinates in the table row", async () => {
    mockReverseGeocodeStops.mockImplementation(async (stops: Stop[]) =>
      stops.map((s) => ({ ...s, placeName: undefined }))
    );
    const res = await POST(queryRequest({ question: "where was I yesterday" }));
    const body = await res.json();
    expect(body.tableRows[0].place).toBe(`${STOP.lat.toFixed(4)}, ${STOP.lon.toFixed(4)}`);
  });

  it("500s when a downstream call throws", async () => {
    mockFetchPingsInRange.mockRejectedValue(new Error("Supabase query failed: timeout"));
    const res = await POST(queryRequest({ question: "where was I yesterday" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Supabase query failed: timeout");
  });
});
