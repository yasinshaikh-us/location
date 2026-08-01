import type { Stop } from "./simplify";

// Sim-time advances this fast per real second while actually in transit.
export const MOVING_MS_PER_SEC = 1000 * 60 * 6;

/**
 * Advances timeline-replay sim-time by one animation frame.
 *
 * Sitting at a stop is visually uninteresting, so while `currentMs` falls
 * within a stop's [arrival, departure) window this jumps straight to that
 * stop's departure instead of crawling (even quickly) through however
 * long the stop lasted -- if you didn't leave the house until 11am, the
 * very next frame jumps the playhead to 11am. The departure bound is
 * exclusive so landing exactly on it reads as "no longer in that stop" on
 * the following call, rather than re-triggering the same jump forever.
 *
 * Otherwise advances at a constant MOVING_MS_PER_SEC based on `deltaSec`
 * of real elapsed time. Never advances past `endMs`.
 */
export function advanceReplayClock(
  currentMs: number,
  deltaSec: number,
  stops: Stop[],
  endMs: number
): number {
  const activeStop = stops.find((s) => {
    const arrival = new Date(s.arrival).getTime();
    const departure = new Date(s.departure).getTime();
    return currentMs >= arrival && currentMs < departure;
  });

  const next = activeStop
    ? new Date(activeStop.departure).getTime()
    : currentMs + deltaSec * MOVING_MS_PER_SEC;

  return Math.min(next, endMs);
}
