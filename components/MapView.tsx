"use client";

import { useEffect, useMemo, useRef } from "react";
import mapboxgl from "mapbox-gl";
import { renderToStaticMarkup } from "react-dom/server";
import type { GeoJSONFeatureCollection } from "@/lib/types";
import { formatDateTime, formatDuration } from "@/lib/format";

mapboxgl.accessToken = process.env.MAPBOX_TOKEN ?? "";

interface MapViewProps {
  geojson: GeoJSONFeatureCollection;
  selectedStopIndex: number | null;
  onSelectStop: (index: number | null) => void;
  /** Interpolated playhead position from the timeline scrubber, if active */
  playhead?: { lat: number; lon: number; isMoving: boolean } | null;
}

const DEFAULT_CENTER: [number, number] = [-122.1795, 47.6205]; // [lon, lat] — Kirkland, WA fallback
const DARK_STYLE = "mapbox://styles/mapbox/dark-v11";
const LIGHT_STYLE = "mapbox://styles/mapbox/light-v11";
const ROUTE_SOURCE_ID = "location-timeline-route";
const ROUTE_LAYER_ID = "location-timeline-route-line";

const START_COLOR = "#059669"; // green — semantic (start), not part of the brand accent
const END_COLOR = "#dc2626"; // red — semantic (end), not part of the brand accent
const STOP_COLOR = "rgb(var(--accent))"; // brand accent, follows the current theme live

function currentTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light"
    ? "light"
    : "dark";
}

function styleForTheme(theme: "light" | "dark") {
  return theme === "light" ? LIGHT_STYLE : DARK_STYLE;
}

/**
 * Mapbox's paint properties don't understand CSS variables, unlike real DOM
 * styles — resolve `rgb(var(--accent))` to a concrete color via a throwaway
 * element so the route line can still follow the current theme.
 */
function resolveColor(color: string): string {
  const probe = document.createElement("div");
  probe.style.display = "none";
  probe.style.color = color;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved;
}

/**
 * Renders a stop marker as a colored badge with a short text label:
 * "S" for the first stop of the range, "E" for the last, and a plain
 * number (1, 2, 3…) for everything in between.
 */
function stopMarkerSize(isSelected: boolean) {
  return isSelected ? 38 : 30;
}

function buildStopElement(label: string, color: string, isSelected: boolean) {
  const size = stopMarkerSize(isSelected);
  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderToStaticMarkup(
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
          ? "0 0 0 6px rgb(var(--accent) / 0.22), 0 2px 8px rgba(0,0,0,0.35)"
          : "0 2px 6px rgba(0,0,0,0.3)",
        border: "2px solid white",
        color: "white",
        fontFamily: "inherit",
        fontWeight: 700,
        fontSize: isSelected ? 14 : 12,
        lineHeight: 1,
        cursor: "pointer",
        transition: "all 150ms ease",
      }}
    >
      {label}
    </div>
  );
  return wrapper.firstElementChild as HTMLElement;
}

/** Plain orange dot marking the current replay position; pulses while moving. */
function buildPlayheadElement(isMoving: boolean) {
  const size = 22;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderToStaticMarkup(
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
  return wrapper.firstElementChild as HTMLElement;
}

export default function MapView({
  geojson,
  selectedStopIndex,
  onSelectStop,
  playhead,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const stopMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const playheadMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const hasFitRef = useRef(false);

  const routeCoords = useMemo(() => {
    const line = geojson.features.find(
      (f) => f.geometry.type === "LineString"
    );
    if (!line || line.geometry.type !== "LineString") return [];
    return line.geometry.coordinates;
  }, [geojson]);

  const stopFeatures = useMemo(
    () => geojson.features.filter((f) => f.geometry.type === "Point"),
    [geojson]
  );

  // Create the map once, and keep it in sync with theme changes.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: styleForTheme(currentTheme()),
      center: DEFAULT_CENTER,
      zoom: 13,
      interactive: false,
    });
    mapRef.current = map;

    const observer = new MutationObserver(() => {
      map.setStyle(styleForTheme(currentTheme()));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      observer.disconnect();
      stopMarkersRef.current.forEach((m) => m.remove());
      stopMarkersRef.current = [];
      playheadMarkerRef.current?.remove();
      playheadMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // (Re)draw the route line whenever the data changes, and again whenever a
  // theme swap reloads the base style (which wipes custom sources/layers).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || routeCoords.length < 2) return;

    function drawRoute() {
      const data = {
        type: "Feature" as const,
        properties: {},
        geometry: { type: "LineString" as const, coordinates: routeCoords },
      };
      const source = map!.getSource(ROUTE_SOURCE_ID) as
        | mapboxgl.GeoJSONSource
        | undefined;
      if (source) {
        source.setData(data);
      } else {
        map!.addSource(ROUTE_SOURCE_ID, { type: "geojson", data });
        map!.addLayer({
          id: ROUTE_LAYER_ID,
          type: "line",
          source: ROUTE_SOURCE_ID,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": resolveColor(STOP_COLOR),
            "line-width": 4,
            "line-opacity": 0.55,
          },
        });
      }
    }

    if (map.isStyleLoaded()) drawRoute();
    else map.once("load", drawRoute);
    map.on("style.load", drawRoute);

    return () => {
      map.off("style.load", drawRoute);
    };
  }, [routeCoords]);

  // Fit the viewport to the route + stops once, the first time data arrives.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || hasFitRef.current) return;

    const allCoords: [number, number][] = [...routeCoords];
    for (const feature of stopFeatures) {
      if (feature.geometry.type === "Point") {
        allCoords.push(feature.geometry.coordinates);
      }
    }
    if (allCoords.length === 0) return;

    const bounds = allCoords.reduce(
      (b, coord) => b.extend(coord),
      new mapboxgl.LngLatBounds(allCoords[0], allCoords[0])
    );
    map.fitBounds(bounds, { padding: 32, maxZoom: 16, animate: false });
    hasFitRef.current = true;
  }, [routeCoords, stopFeatures]);

  // Stop markers + popups.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    stopMarkersRef.current.forEach((m) => m.remove());
    stopMarkersRef.current = [];

    stopFeatures.forEach((feature, i) => {
      if (feature.geometry.type !== "Point") return;
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

      const el = buildStopElement(label, color, isSelected);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelectStop(props.index);
      });

      const popup = new mapboxgl.Popup({
        offset: stopMarkerSize(isSelected) / 2 + 6,
        closeButton: false,
      }).setHTML(
        renderToStaticMarkup(
          <div className="text-sm">
            <div className="font-semibold">{props.place}</div>
            <div>
              {formatDateTime(props.arrival)} –{" "}
              {formatDateTime(props.departure)}
            </div>
            <div className="text-faint">
              {formatDuration(props.durationMinutes)}
            </div>
          </div>
        )
      );

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([lon, lat])
        .setPopup(popup)
        .addTo(map);
      stopMarkersRef.current.push(marker);
    });
  }, [stopFeatures, selectedStopIndex, onSelectStop]);

  // Playhead marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    playheadMarkerRef.current?.remove();
    playheadMarkerRef.current = null;

    if (playhead) {
      const el = buildPlayheadElement(playhead.isMoving);
      playheadMarkerRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat([playhead.lon, playhead.lat])
        .addTo(map);
    }
  }, [playhead]);

  return (
    <>
      <style>{`
        @keyframes lt-pulse {
          0% { transform: scale(0.6); opacity: 0.9; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        .mapboxgl-map, .mapboxgl-popup-content { font-family: inherit; }
      `}</style>
      <div ref={containerRef} className="h-full w-full rounded-2xl" />
    </>
  );
}
