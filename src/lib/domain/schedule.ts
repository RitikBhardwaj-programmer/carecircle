import type { Dose, DoseLog, Medication, ProfileSettings } from "./types";
import { MINUTE_MS, weekdayOf, zonedToUtc } from "./time";

/** Deterministic dose id: same medication, date and time always give the same id. */
export function doseId(medicationId: string, date: string, time: string): string {
  return `${medicationId}_${date}_${time.replace(":", "")}`;
}

/** Parses a dose id back into its parts, or returns null if the format is wrong. */
export function parseDoseId(id: string): { medicationId: string; date: string; time: string } | null {
  const match = /^([A-Za-z0-9-]{1,64})_(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})$/.exec(id);
  if (!match) return null;
  const [, medicationId, date, hh, mm] = match as unknown as [string, string, string, string, string];
  if (Number(hh) > 23 || Number(mm) > 59) return null;
  return { medicationId, date, time: `${hh}:${mm}` };
}

/** True when the medication is scheduled on the given local date. */
export function isScheduledOn(med: Medication, date: string): boolean {
  if (!med.active) return false;
  if (date < med.startDate) return false;
  if (med.endDate && date > med.endDate) return false;
  return med.days.length === 0 || med.days.includes(weekdayOf(date));
}

/** All doses of a medication on one local date, in time order. */
export function dosesForDay(med: Medication, date: string, timeZone: string): Dose[] {
  if (!isScheduledOn(med, date)) return [];
  return [...med.times].sort().map((time) => ({
    id: doseId(med.id, date, time),
    medicationId: med.id,
    date,
    time,
    at: zonedToUtc(date, time, timeZone).toISOString(),
  }));
}

export type DoseState = "taken" | "skipped" | "missed" | "due" | "upcoming";

/** Status of a single dose for the "today" view. */
export function doseState(
  dose: Dose,
  log: DoseLog | undefined,
  now: Date,
  settings: Pick<ProfileSettings, "missedGraceMin">,
): DoseState {
  if (log) return log.status;
  const at = Date.parse(dose.at);
  if (now.getTime() >= at + settings.missedGraceMin * MINUTE_MS) return "missed";
  if (now.getTime() >= at) return "due";
  return "upcoming";
}
