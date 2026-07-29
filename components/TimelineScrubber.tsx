"use client";

import { useEffect, useRef, useState } from "react";
import type { Stop } from "@/lib/simplify";

interface TimelineScrubberProps {
  startMs: number;
  endMs: number;
  currentMs: number;
  onScrub: (ms: number) => void;
  stops: Stop[];
}

const PLAYBACK_SPEED_MS_PER_SEC = 1000 * 60 * 15; // 15 sim-minutes per real second

export default function TimelineScrubber({
  startMs,
  endMs,
  currentMs,
  onScrub,
  stops,
}: TimelineScrubberProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);

  const span = Math.max(endMs - startMs, 1);
  const progress = Math.min(Math.max((currentMs - startMs) / span, 0), 1);

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastFrameRef.current = null;
      return;
    }

    function tick(now: number) {
      if (lastFrameRef.current == null) lastFrameRef.current = now;
      const deltaSec = (now - lastFrameRef.current) / 1000;
      lastFrameRef.current = now;

      const next = currentMs + deltaSec * PLAYBACK_SPEED_MS_PER_SEC;
      if (next >= endMs) {
        onScrub(endMs);
        setIsPlaying(false);
        return;
      }
      onScrub(next);
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  function handleSliderChange(value: number) {
    setIsPlaying(false);
    onScrub(startMs + (value / 1000) * span);
  }

  function togglePlay() {
    if (progress >= 0.999) {
      onScrub(startMs);
    }
    setIsPlaying((p) => !p);
  }

  const timeLabel = new Date(currentMs).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">Replay</span>
        <span className="rounded-full bg-slate-900 px-3 py-1 text-sm font-semibold tabular-nums text-white">
          {timeLabel}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          aria-label={isPlaying ? "Pause" : "Play"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-md transition active:scale-95"
        >
          {isPlaying ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="5" y="4" width="5" height="16" rx="1" />
              <rect x="14" y="4" width="5" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 4.5v15l13-7.5-13-7.5z" />
            </svg>
          )}
        </button>

        <div className="relative flex-1">
          {/* Stop ticks along the track */}
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2">
            {stops.map((s, i) => {
              const t = new Date(s.arrival).getTime();
              const pct = ((t - startMs) / span) * 100;
              if (pct < 0 || pct > 100) return null;
              return (
                <div
                  key={i}
                  className="absolute h-2 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/70"
                  style={{ left: `${pct}%`, top: "50%" }}
                />
              );
            })}
          </div>

          <input
            type="range"
            min={0}
            max={1000}
            value={progress * 1000}
            onChange={(e) => handleSliderChange(Number(e.target.value))}
            className="relative w-full accent-blue-600"
            style={{ height: "24px" }}
          />
        </div>
      </div>
    </div>
  );
}
