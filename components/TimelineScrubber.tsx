"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import type { Stop } from "@/lib/simplify";
import { formatTime } from "@/lib/format";

interface TimelineScrubberProps {
  startMs: number;
  endMs: number;
  currentMs: number;
  onScrub: (ms: number) => void;
  stops: Stop[];
  /** Starts playback automatically on mount. Defaults to true. */
  autoPlay?: boolean;
}

// Sim-time advances this fast per real second while actually in transit...
const MOVING_MS_PER_SEC = 1000 * 60 * 6;
// ...and this many times faster while parked at a stop, so replay doesn't
// crawl through hours spent sitting still.
const STOPPED_SPEED_MULTIPLIER = 18;

export default function TimelineScrubber({
  startMs,
  endMs,
  currentMs,
  onScrub,
  stops,
  autoPlay = true,
}: TimelineScrubberProps) {
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  // Tracks sim time across animation frames directly, rather than
  // re-deriving it from the (possibly stale) `currentMs` prop closure.
  const simMsRef = useRef(currentMs);

  const span = Math.max(endMs - startMs, 1);
  const progress = Math.min(Math.max((currentMs - startMs) / span, 0), 1);

  useEffect(() => {
    simMsRef.current = currentMs;
  }, [currentMs]);

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastFrameRef.current = null;
      return;
    }

    function isStoppedAt(ms: number) {
      return stops.some((s) => {
        const arrival = new Date(s.arrival).getTime();
        const departure = new Date(s.departure).getTime();
        return ms >= arrival && ms <= departure;
      });
    }

    function tick(now: number) {
      if (lastFrameRef.current == null) lastFrameRef.current = now;
      const deltaSec = (now - lastFrameRef.current) / 1000;
      lastFrameRef.current = now;

      const speed = isStoppedAt(simMsRef.current)
        ? MOVING_MS_PER_SEC * STOPPED_SPEED_MULTIPLIER
        : MOVING_MS_PER_SEC;

      const next = simMsRef.current + deltaSec * speed;
      if (next >= endMs) {
        simMsRef.current = endMs;
        onScrub(endMs);
        setIsPlaying(false);
        return;
      }
      simMsRef.current = next;
      onScrub(next);
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, endMs]);

  function handleSliderChange(value: number) {
    setIsPlaying(false);
    const ms = startMs + (value / 1000) * span;
    simMsRef.current = ms;
    onScrub(ms);
  }

  function togglePlay() {
    if (progress >= 0.999) {
      simMsRef.current = startMs;
      onScrub(startMs);
    }
    setIsPlaying((p) => !p);
  }

  const timeLabel = formatTime(currentMs);

  return (
    <div className="rounded-2xl border border-border bg-surface/80 p-4 backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-faint">Replay</span>
        <span className="rounded-full bg-accent px-3 py-1 font-mono text-sm font-semibold tabular-nums text-bg">
          {timeLabel}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          aria-label={isPlaying ? "Pause" : "Play"}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-bg transition hover:bg-accent-strong active:scale-95"
        >
          {isPlaying ? (
            <Pause size={16} fill="currentColor" strokeWidth={0} />
          ) : (
            <Play
              size={16}
              fill="currentColor"
              strokeWidth={0}
              className="ml-0.5"
            />
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
                  className="absolute h-2 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/70"
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
            className="relative w-full accent-accent"
            style={{ height: "24px" }}
          />
        </div>
      </div>
    </div>
  );
}
