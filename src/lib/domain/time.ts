/**
 * Time-zone helpers built on Intl only (no date library).
 * Local dates are "YYYY-MM-DD" strings and local times are "HH:mm" strings.
 */

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

/** Returns true when the string is a valid IANA time zone known to the runtime. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    return false;
  }
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClock(instantMs: number, timeZone: string): WallClock {
  const parts = formatterFor(timeZone).formatToParts(new Date(instantMs));
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** Local date, time and weekday of an instant in a time zone. */
export function localParts(instant: Date, timeZone: string): { date: string; time: string; weekday: number } {
  const w = wallClock(instant.getTime(), timeZone);
  const date = `${w.year}-${pad(w.month)}-${pad(w.day)}`;
  return { date, time: `${pad(w.hour)}:${pad(w.minute)}`, weekday: weekdayOf(date) };
}

/** Offset of the time zone from UTC at the given instant, in ms (IST = +19 800 000). */
export function tzOffsetMs(instantMs: number, timeZone: string): number {
  const w = wallClock(instantMs, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(instantMs / 1000) * 1000;
}

/** Converts a local date + time in a time zone to the UTC instant. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - tzOffsetMs(guess, timeZone);
  // Re-check once so a DST change between guess and result is handled.
  const second = guess - tzOffsetMs(first, timeZone);
  return new Date(second);
}

/** Weekday (0 = Sunday) of a calendar date; independent of time zone. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Adds whole days to a calendar date. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Inclusive list of dates from `from` to `to`. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
