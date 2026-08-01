import type { Stop, RoutePoint } from "./simplify";

export interface QueryRequestBody {
  question: string;
}

// Minimal local GeoJSON typing — avoids pulling in @types/geojson for
// the couple of shapes this app actually produces.
export interface GeoJSONFeature {
  type: "Feature";
  geometry:
    | { type: "LineString"; coordinates: [number, number][] }
    | { type: "Point"; coordinates: [number, number] };
  properties: Record<string, unknown>;
}

export interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

export interface QueryResponseBody {
  question: string;
  dateRange: { start: string; end: string };
  summary: string;
  stops: Stop[];
  route: RoutePoint[];
  // One LineString feature (route) + one Point feature per stop
  geojson: GeoJSONFeatureCollection;
  tableRows: TableRow[];
}

export interface TableRow {
  index: number;
  place: string;
  arrival: string;
  departure: string;
  // See Stop.arrivalKnown/departureKnown -- false means `arrival`/
  // `departure` just reflects where the query window starts/ends, not
  // an actual observed arrival or departure.
  arrivalKnown: boolean;
  departureKnown: boolean;
  durationMinutes: number;
  lat: number;
  lon: number;
}

export interface ApiErrorBody {
  error: string;
}
