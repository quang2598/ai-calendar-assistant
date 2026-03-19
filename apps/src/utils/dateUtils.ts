/**
 * Returns today's date as "YYYY-MM-DD" in the user's LOCAL timezone.
 * Never uses toISOString() which converts to UTC.
 */
export function getTodayLocalISO(): string {
  return dateToLocalISO(new Date());
}

/**
 * Converts a Date to "YYYY-MM-DD" in the user's LOCAL timezone.
 */
export function dateToLocalISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Returns start and end ISO strings for a given date in the user's LOCAL timezone.
 * These are suitable for Google Calendar API timeMin/timeMax params.
 *
 * Example: "2026-03-18" in CST → start: "2026-03-18T00:00:00-05:00", end: "2026-03-18T23:59:59-05:00"
 */
export function getLocalDayBounds(dateISO: string): { start: string; end: string } {
  const startDate = new Date(`${dateISO}T00:00:00`);
  const endDate = new Date(`${dateISO}T23:59:59`);

  return {
    start: toLocalISOString(startDate),
    end: toLocalISOString(endDate),
  };
}

/**
 * Converts a Date to an ISO 8601 string WITH local timezone offset.
 * Unlike Date.toISOString() which always returns UTC (Z suffix),
 * this returns the local representation with offset (e.g., "-05:00").
 */
function toLocalISOString(date: Date): string {
  const offsetMinutes = date.getTimezoneOffset();
  const sign = offsetMinutes <= 0 ? "+" : "-";
  const absOffset = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absOffset / 60)).padStart(2, "0");
  const offsetMins = String(absOffset % 60).padStart(2, "0");
  const offsetStr = `${sign}${offsetHours}:${offsetMins}`;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offsetStr}`;
}
