"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { renderToStaticMarkup } from "react-dom/server";
import type { GeoJSONFeatureCollection } from "@/lib/types";
import { formatDateTime, formatDuration } from "@/lib/format";

interface MapViewProps {
  geojson: GeoJSONFeatureCollection;
  selectedStopIndex: number | null;
  onSelectStop: (index: number | null) => void;
  /** Interpolated playhead position from the timeline scrubber, if active */
  playhead?: { lat: number; lon: number; isMoving: boolean } | null;
}

const DEFAULT_CENTER: [number, number] = [47.6205, -122.1795]; // Kirkland, WA fallback

function buildDivIcon(html: string, size: number) {
  return L.divIcon({
    html,
    className: "location-timeline-icon",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/**
 * Renders a stop marker as a colored badge with a short text label:
 * "S" for the first stop of the range, "E" for the last, and a plain
 * number (1, 2, 3…) for everything in between.
 */
function stopIcon(label: string, color: string, isSelected: boolean) {
  const size = isSelected ? 38 : 30;
  const html = renderToStaticMarkup(
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "9999px",
        background: color,
        boxShadow: isSelected
          ? "0 0 0 6px rgba(37,99,235,0.22), 0 2px 8px rgba(0,0,0,0.35)"
          : "0 2px 6px rgba(0,0,0,0.3)",
        border: "2px solid white",
        color: "white",
        fontFamily: "inherit",
        fontWeight: 700,
        fontSize: isSelected ? 14 : 12,
        lineHeight: 1,
        transition: "all 150ms ease",
      }}
    >
      {label}
    </div>
  );
  return buildDivIcon(html, size);
}

const START_COLOR = "#059669"; // green
const END_COLOR = "#dc2626"; // red
const STOP_COLOR = "#1d4ed8"; // blue

/** Plain orange dot marking the current replay position; pulses while moving. */
function playheadIcon(isMoving: boolean) {
  const size = 22;
  const html = renderToStaticMarkup(
    <div style={{ position: "relative", width: size, height: size }}>
      {isMoving && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "9999px",
            background: "rgba(249,115,22,0.35)",
            animation: "lt-pulse 1.4s ease-out infinite",
          }}
        />
      )}
      <div
        style={{
          position: "absolute",
          inset: 3,
          borderRadius: "9999px",
          background: "#f97316",
          border: "2px solid white",
          boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
        }}
      />
    </div>
  );
  return buildDivIcon(html, size);
}

function FitToData({ geojson }: { geojson: GeoJSONFeatureCollection }) {
  const map = useMap();
  const hasFit = useRef(false);

  useEffect(() => {
    if (hasFit.current) return;
    const allCoords: [number, number][] = [];
    for (const feature of geojson.features) {
      if (feature.geometry.type === "LineString") {
        for (const [lon, lat] of feature.geometry.coordinates) {
          allCoords.push([lat, lon]);
        }
      } else if (feature.geometry.type === "Point") {
        const [lon, lat] = feature.geometry.coordinates;
        allCoords.push([lat, lon]);
      }
    }
    if (allCoords.length > 0) {
      map.fitBounds(allCoords, { padding: [32, 32], maxZoom: 16 });
      hasFit.current = true;
    }
  }, [geojson, map]);

  return null;
}

export default function MapView({
  geojson,
  selectedStopIndex,
  onSelectStop,
  playhead,
}: MapViewProps) {
  const routeCoords = useMemo(() => {
    const line = geojson.features.find(
      (f) => f.geometry.type === "LineString"
    );
    if (!line || line.geometry.type !== "LineString") return [];
    return line.geometry.coordinates.map(
      ([lon, lat]) => [lat, lon] as [number, number]
    );
  }, [geojson]);

  const stopFeatures = useMemo(
    () => geojson.features.filter((f) => f.geometry.type === "Point"),
    [geojson]
  );

  return (
    <>
      <style>{`
        @keyframes lt-pulse {
          0% { transform: scale(0.6); opacity: 0.9; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        .location-timeline-icon { background: transparent; border: none; }
        .leaflet-container { font-family: inherit; }
      `}</style>
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={13}
        scrollWheelZoom
        className="h-full w-full rounded-2xl"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitToData geojson={geojson} />

        {routeCoords.length > 1 && (
          <Polyline
            positions={routeCoords}
            pathOptions={{ color: "#2563eb", weight: 4, opacity: 0.55 }}
          />
        )}

        {stopFeatures.map((feature, i) => {
          if (feature.geometry.type !== "Point") return null;
          const [lon, lat] = feature.geometry.coordinates;
          const props = feature.properties as {
            index: number;
            place: string;
            arrival: string;
            departure: string;
            durationMinutes: number;
          };
          const isSelected = selectedStopIndex === props.index;
          const isFirst = i === 0;
          const isLast = i === stopFeatures.length - 1 && stopFeatures.length > 1;
          const label = isFirst ? "S" : isLast ? "E" : String(i);
          const color = isFirst ? START_COLOR : isLast ? END_COLOR : STOP_COLOR;

          return (
            <Marker
              key={i}
              position={[lat, lon]}
              icon={stopIcon(label, color, isSelected)}
              eventHandlers={{ click: () => onSelectStop(props.index) }}
            >
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold">{props.place}</div>
                  <div>
                    {formatDateTime(props.arrival)} –{" "}
                    {formatDateTime(props.departure)}
                  </div>
                  <div className="text-gray-500">
                    {formatDuration(props.durationMinutes)}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {playhead && (
          <Marker
            position={[playhead.lat, playhead.lon]}
            icon={playheadIcon(playhead.isMoving)}
            zIndexOffset={1000}
          />
        )}
      </MapContainer>
    </>
  );
}
