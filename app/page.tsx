"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import QueryBox from "@/components/QueryBox";
import RouteTable from "@/components/RouteTable";
import TimelineScrubber from "@/components/TimelineScrubber";
import { interpolatePosition } from "@/lib/interpolate";
import type { QueryResponseBody, ApiErrorBody } from "@/lib/types";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-slate-400">
      Loading map…
    </div>
  ),
});

export default function HomePage() {
  const router = useRouter();
  const [result, setResult] = useState<QueryResponseBody | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStopIndex, setSelectedStopIndex] = useState<number | null>(
    null
  );
  const [scrubMs, setScrubMs] = useState<number | null>(null);

  const routeBounds = useMemo(() => {
    if (!result || result.route.length === 0) return null;
    const times = result.route.map((p) => new Date(p.tst).getTime());
    return { start: Math.min(...times), end: Math.max(...times) };
  }, [result]);

  const playhead = useMemo(() => {
    if (!result || scrubMs == null || result.route.length === 0) return null;
    return interpolatePosition(result.route, scrubMs);
  }, [result, scrubMs]);

  async function handleQuery(question: string) {
    setIsLoading(true);
    setError(null);
    setSelectedStopIndex(null);
    setScrubMs(null);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      const data = (await res.json()) as QueryResponseBody | ApiErrorBody;

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      if (!res.ok || "error" in data) {
        setError("error" in data ? data.error : "Something went wrong");
        setResult(null);
      } else {
        setResult(data);
        if (data.route.length > 0) {
          setScrubMs(new Date(data.route[0].tst).getTime());
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
        <header className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              Location Timeline
            </h1>
            <p className="text-sm text-slate-500">
              Ask a question about your own location history.
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="mt-1 text-xs font-medium text-slate-400 underline decoration-dotted underline-offset-4 hover:text-slate-600"
          >
            Sign out
          </button>
        </header>

        <QueryBox onSubmit={handleQuery} isLoading={isLoading} />

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-blue-600">
                {result.dateRange.start === result.dateRange.end
                  ? result.dateRange.start
                  : `${result.dateRange.start} → ${result.dateRange.end}`}
              </div>
              <p className="text-sm leading-relaxed text-slate-700">
                {result.summary}
              </p>
            </div>

            <div className="h-[340px] overflow-hidden rounded-2xl shadow-sm sm:h-[420px]">
              <MapView
                geojson={result.geojson}
                selectedStopIndex={selectedStopIndex}
                onSelectStop={setSelectedStopIndex}
                playhead={playhead}
              />
            </div>

            {routeBounds && scrubMs != null && (
              <TimelineScrubber
                startMs={routeBounds.start}
                endMs={routeBounds.end}
                currentMs={scrubMs}
                onScrub={setScrubMs}
                stops={result.stops}
              />
            )}

            <div className="max-h-[420px] overflow-auto rounded-2xl shadow-sm">
              <RouteTable
                rows={result.tableRows}
                selectedIndex={selectedStopIndex}
                onSelectRow={setSelectedStopIndex}
              />
            </div>
          </div>
        )}

        {!result && !isLoading && !error && (
          <div className="flex h-56 items-center justify-center rounded-2xl border border-dashed border-slate-300 text-sm text-slate-400">
            Try one of the example questions above to get started.
          </div>
        )}
      </div>
    </main>
  );
}
