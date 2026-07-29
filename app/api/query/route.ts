import { NextRequest, NextResponse } from "next/server";
import { fetchPingsInRange } from "@/lib/supabase";
import { parseDateRangeFromQuestion, summarizeStops } from "@/lib/anthropic";
import {
  clusterIntoStops,
  simplifyRoute,
  reverseGeocodeStops,
} from "@/lib/simplify";
import { pacificDayBoundsUtc, todayInPacific } from "@/lib/format";
import type {
  QueryRequestBody,
  QueryResponseBody,
  GeoJSONFeatureCollection,
  TableRow,
  ApiErrorBody,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  req: NextRequest
): Promise<NextResponse<QueryResponseBody | ApiErrorBody>> {
  try {
    const body = (await req.json()) as QueryRequestBody;
    const question = body.question?.trim();

    if (!question) {
      return NextResponse.json(
        { error: "Missing 'question' in request body" },
        { status: 400 }
      );
    }

    // 1. Anchor "today" to the server's actual current date in Pacific
    //    Time (not the server's own timezone), then ask Claude to turn
    //    the NL question into a concrete date range.
    const todayIso = todayInPacific();
    const { start, end, reasoning } = await parseDateRangeFromQuestion(
      question,
      todayIso
    );

    // Convert the inclusive Pacific-time date range into UTC timestamps
    // for the query — a Pacific calendar day doesn't start at 00:00 UTC.
    const startIso = pacificDayBoundsUtc(start).startIso;
    const endIso = pacificDayBoundsUtc(end).endIso;

    // 2. Pull raw pings from Supabase/PostGIS for that range.
    const pings = await fetchPingsInRange(startIso, endIso);

    // 3. Cluster into stops + simplify the in-transit polyline.
    const { stops: rawStops, route: rawRoute } = clusterIntoStops(pings);
    const simplifiedRoute = simplifyRoute(rawRoute, 15);

    // 4. Reverse-geocode stops into place names (skip if too many, to
    //    stay within Nominatim's free-tier rate limit and request time).
    const stops =
      rawStops.length > 0 && rawStops.length <= 15
        ? await reverseGeocodeStops(rawStops)
        : rawStops;

    // 5. Ask Claude for a short natural-language summary of the period.
    const summary = await summarizeStops(question, stops, { start, end });

    // 6. Build GeoJSON for the map layer.
    const geojson: GeoJSONFeatureCollection = {
      type: "FeatureCollection",
      features: [
        ...(simplifiedRoute.length > 1
          ? [
              {
                type: "Feature" as const,
                geometry: {
                  type: "LineString" as const,
                  coordinates: simplifiedRoute.map(
                    (p) => [p.lon, p.lat] as [number, number]
                  ),
                },
                properties: { kind: "route" },
              },
            ]
          : []),
        ...stops.map((s, i) => ({
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [s.lon, s.lat] as [number, number],
          },
          properties: {
            kind: "stop",
            index: i,
            place: s.placeName ?? "Unknown location",
            arrival: s.arrival,
            departure: s.departure,
            durationMinutes: s.durationMinutes,
          },
        })),
      ],
    };

    // 7. Build the tabular representation.
    const tableRows: TableRow[] = stops.map((s, i) => ({
      index: i + 1,
      place: s.placeName ?? `${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}`,
      arrival: s.arrival,
      departure: s.departure,
      durationMinutes: s.durationMinutes,
      lat: s.lat,
      lon: s.lon,
    }));

    const response: QueryResponseBody = {
      question,
      dateRange: { start, end },
      summary:
        stops.length === 0
          ? `No location data was recorded between ${start} and ${end}. (${reasoning})`
          : summary,
      stops,
      route: simplifiedRoute,
      geojson,
      tableRows,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("Query API error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
