"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import QueryBox from "@/components/QueryBox";
import RouteTable from "@/components/RouteTable";
import type { QueryResponseBody, ApiErrorBody } from "@/lib/types";

// Leaflet touches `window`, so the map must be client-only and loaded
// without SSR.
const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-gray-400">
      Loading map…
    </div>
  ),
});

export default function HomePage() {
  const [result, setResult] = useState<QueryResponseBody | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStopIndex, setSelectedStopIndex] = useState<number | null>(
    null
  );

  async function handleQuery(question: string) {
    setIsLoading(true);
    setError(null);
    setSelectedStopIndex(null);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      const data = (await res.json()) as QueryResponseBody | ApiErrorBody;

      if (!res.ok || "error" in data) {
        setError("error" in data ? data.error : "Something went wrong");
        setResult(null);
      } else {
        setResult(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Location Timeline</h1>
        <p className="text-sm text-gray-500">
          Ask a question about your own location history in plain English.
        </p>
      </header>

      <QueryBox onSubmit={handleQuery} isLoading={isLoading} />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-6">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-1 text-xs uppercase tracking-wide text-gray-400">
              {result.dateRange.start === result.dateRange.end
                ? result.dateRange.start
                : `${result.dateRange.start} → ${result.dateRange.end}`}
            </div>
            <p className="text-sm leading-relaxed">{result.summary}</p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="h-[500px]">
              <MapView
                geojson={result.geojson}
                selectedStopIndex={selectedStopIndex}
                onSelectStop={setSelectedStopIndex}
              />
            </div>
            <div className="h-[500px] overflow-auto">
              <RouteTable
                rows={result.tableRows}
                selectedIndex={selectedStopIndex}
                onSelectRow={setSelectedStopIndex}
              />
            </div>
          </div>
        </div>
      )}

      {!result && !isLoading && !error && (
        <div className="flex h-64 items-center justify-center text-sm text-gray-400">
          Try one of the example questions above to get started.
        </div>
      )}
    </main>
  );
}
