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

/** Minutes -> "26 min" under an hour, "16h 57m" / "17h" at or above. */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining === 0 ? `${hours}h` : `${hours}h ${remaining}m`;
}
