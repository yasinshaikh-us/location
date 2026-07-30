const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * "2025-09-20" -> "Sep 20". Parses the date-only string manually rather
 * than going through `new Date(...)` + local-timezone formatting, which
 * would risk shifting the calendar date across midnight for
 * negative-UTC-offset timezones.
 */
export function formatShortDate(dateOnlyIso: string): string {
  const [, month, day] = dateOnlyIso.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}`;
}

// All timestamps in the UI are shown in Pacific Time regardless of the
// viewer's own device/browser timezone, since the location history this
// app displays is inherently tied to the Pacific-time-zone person it
// belongs to. "America/Los_Angeles" resolves to PST or PDT automatically
// depending on daylight saving.
const TIME_ZONE = "America/Los_Angeles";

/** Full ISO timestamp -> "4:32 PM" (no seconds, always Pacific Time). */
export function formatTime(
  iso: string | number,
  opts: { withZoneAbbr?: boolean } = {}
): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: TIME_ZONE,
    ...(opts.withZoneAbbr ? { timeZoneName: "short" } : {}),
  });
}

/** Full ISO timestamp -> "Sep 20, 4:32 PM" (no year, no seconds, Pacific Time). */
export function formatDateTime(iso: string): string {
  const d = new Date(
    new Date(iso).toLocaleString("en-US", { timeZone: TIME_ZONE })
  );
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${formatTime(iso)}`;
}

/**
 * Strips markdown emphasis markers (**bold**, __bold__, *italic*,
 * _italic_) from LLM-generated prose that's rendered as plain text
 * rather than through a markdown renderer.
 */
export function stripMarkdownEmphasis(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1");
}

/** Minutes -> "26 min" under an hour, "16h 57m" / "17h" at or above. */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining === 0 ? `${hours}h` : `${hours}h ${remaining}m`;
}

/**
 * The UTC-minus-Pacific offset (in ms) in effect at a given instant,
 * accounting for PST/PDT automatically. `localWallClockMs = utcMs +
 * offset`, so `utcMs = localWallClockMs - offset`.
 */
function pacificOffsetMs(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  return asUtc - utcMs;
}

/**
 * Converts a "YYYY-MM-DD" *Pacific-time* calendar date into the UTC
 * instants for its local midnight and its final millisecond
 * (00:00:00.000 and 23:59:59.999 Pacific, expressed as UTC ISO strings).
 * Used so a "day" in query ranges/results matches the Pacific-time day
 * actually shown in the UI, rather than a UTC day (which, at UTC-7/-8,
 * would start ~7-8 hours before Pacific midnight and clip the evening).
 */
export function pacificDayBoundsUtc(dateOnlyIso: string): {
  startIso: string;
  endIso: string;
} {
  const [y, m, d] = dateOnlyIso.split("-").map(Number);
  const startGuess = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  const endGuess = Date.UTC(y, m - 1, d, 23, 59, 59, 999);
  return {
    startIso: new Date(startGuess - pacificOffsetMs(startGuess)).toISOString(),
    endIso: new Date(endGuess - pacificOffsetMs(endGuess)).toISOString(),
  };
}

/** Today's date as "YYYY-MM-DD" in Pacific Time, not the server's own timezone. */
export function todayInPacific(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
