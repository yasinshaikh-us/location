"use client";

import { useEffect, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import type { GeoJSONFeatureCollection } from "@/lib/types";

interface MapViewProps {
  geojson: GeoJSONFeatureCollection;
  selectedStopIndex: number | null;
  onSelectStop: (index: number | null) => void;
}

const DEFAULT_CENTER: [number, number] = [47.6205, -122.1795]; // Kirkland, WA fallback

function FitToData({ geojson }: { geojson: GeoJSONFeatureCollection }) {
  const map = useMap();

  useEffect(() => {
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
      map.fitBounds(allCoords, { padding: [40, 40], maxZoom: 16 });
    }
  }, [geojson, map]);

  return null;
}

export default function MapView({
  geojson,
  selectedStopIndex,
  onSelectStop,
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
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={13}
      scrollWheelZoom
      className="h-full w-full rounded-lg"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitToData geojson={geojson} />

      {routeCoords.length > 1 && (
        <Polyline
          positions={routeCoords}
          pathOptions={{ color: "#2563eb", weight: 3, opacity: 0.7 }}
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

        return (
          <CircleMarker
            key={i}
            center={[lat, lon]}
            radius={isSelected ? 11 : 7}
            pathOptions={{
              color: isSelected ? "#dc2626" : "#059669",
              fillColor: isSelected ? "#dc2626" : "#059669",
              fillOpacity: 0.85,
              weight: 2,
            }}
            eventHandlers={{
              click: () => onSelectStop(props.index),
            }}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-semibold">{props.place}</div>
                <div>
                  {new Date(props.arrival).toLocaleString()} –{" "}
                  {new Date(props.departure).toLocaleString()}
                </div>
                <div className="text-gray-500">
                  {props.durationMinutes} min
                </div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
