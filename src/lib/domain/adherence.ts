import type { DoseLog, Medication } from "./types";
import { dosesForDay } from "./schedule";
import { addDays, dateRange, MINUTE_MS } from "./time";

export interface AdherenceStats {
  /** Doses whose grace period has passed (they can be judged). */
  due: number;
  taken: number;
  skipped: number;
  missed: number;
  /** taken / due as a whole percentage, or null when nothing was due yet. */
  rate: number | null;
}

/**
 * Adherence of one medication over the `days` local dates ending at `today` (inclusive).
 * A dose counts only after its grace period, so a dose due in 5 minutes is not "missed".
 */
export function adherenceFor(
  med: Medication,
  logs: ReadonlyMap<string, DoseLog>,
  today: string,
  days: number,
  now: Date,
  timeZone: string,
  graceMin: number,
): AdherenceStats {
  const stats: AdherenceStats = { due: 0, taken: 0, skipped: 0, missed: 0, rate: null };
  for (const date of dateRange(addDays(today, -(days - 1)), today)) {
    for (const dose of dosesForDay(med, date, timeZone)) {
      const log = logs.get(dose.id);
      const judged = log !== undefined || now.getTime() >= Date.parse(dose.at) + graceMin * MINUTE_MS;
      if (!judged) continue;
      stats.due += 1;
      if (log?.status === "taken") stats.taken += 1;
      else if (log?.status === "skipped") stats.skipped += 1;
      else stats.missed += 1;
    }
  }
  stats.rate = stats.due === 0 ? null : Math.round((stats.taken / stats.due) * 100);
  return stats;
}
