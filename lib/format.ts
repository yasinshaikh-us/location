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

/** Full ISO timestamp -> "4:32 PM" (no seconds, viewer's local time). */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Full ISO timestamp -> "Sep 20, 4:32 PM" (no year, no seconds). */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${formatTime(iso)}`;
}

/** Minutes -> "26 min" under an hour, "16h 57m" / "17h" at or above. */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining === 0 ? `${hours}h` : `${hours}h ${remaining}m`;
}
