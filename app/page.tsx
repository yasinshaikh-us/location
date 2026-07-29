"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { LogOut, MapPin } from "lucide-react";
import QueryBox from "@/components/QueryBox";
import RouteTable from "@/components/RouteTable";
import TimelineScrubber from "@/components/TimelineScrubber";
import { interpolatePosition } from "@/lib/interpolate";
import { formatShortDate } from "@/lib/format";
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
  const [queryVersion, setQueryVersion] = useState(0);
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
        setQueryVersion((v) => v + 1);
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
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-blue-50/50">
      <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-10">
        <header className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm shadow-blue-600/30">
              <MapPin size={20} strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold tracking-tight text-slate-900 sm:text-2xl">
                Location Timeline
              </h1>
              <p className="truncate text-xs text-slate-500 sm:text-sm">
                Ask a question about your own location history
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-700"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </header>

        <QueryBox onSubmit={handleQuery} isLoading={isLoading} />

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-1.5 inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700">
                {result.dateRange.start === result.dateRange.end
                  ? formatShortDate(result.dateRange.start)
                  : `${formatShortDate(result.dateRange.start)} – ${formatShortDate(
                      result.dateRange.end
                    )}`}
              </div>
              <p className="text-sm leading-relaxed text-slate-700">
                {result.summary}
              </p>
            </div>

            <div className="h-[340px] overflow-hidden rounded-2xl border border-slate-200 shadow-sm sm:h-[420px]">
              <MapView
                geojson={result.geojson}
                selectedStopIndex={selectedStopIndex}
                onSelectStop={setSelectedStopIndex}
                playhead={playhead}
              />
            </div>

            {routeBounds && scrubMs != null && (
              <TimelineScrubber
                key={queryVersion}
                startMs={routeBounds.start}
                endMs={routeBounds.end}
                currentMs={scrubMs}
                onScrub={setScrubMs}
                stops={result.stops}
              />
            )}

            <div className="max-h-[420px] overflow-auto rounded-2xl border border-slate-200 shadow-sm">
              <RouteTable
                rows={result.tableRows}
                selectedIndex={selectedStopIndex}
                onSelectRow={setSelectedStopIndex}
              />
            </div>
          </div>
        )}

        {!result && !isLoading && !error && (
          <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/50 text-center text-sm text-slate-400">
            <MapPin size={26} className="text-slate-300" />
            Try one of the example questions above to get started.
          </div>
        )}
      </div>
    </main>
  );
}
