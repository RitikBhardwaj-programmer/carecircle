/** Parts of the day used to group today's doses. Boundaries follow how people talk about their day. */
export type DayPart = "morning" | "afternoon" | "evening" | "night";

export const DAY_PARTS: readonly DayPart[] = ["morning", "afternoon", "evening", "night"];

/**
 * Local "HH:mm" → part of the day.
 * Morning 04:00–11:59, afternoon 12:00–16:59, evening 17:00–20:59, night 21:00–03:59.
 */
export function dayPartOf(time: string): DayPart {
  const hour = Number(time.slice(0, 2));
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error(`Invalid time: ${time}`);
  if (hour >= 4 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

/** Groups doses by part of the day, keeping their order. Empty parts are left out. */
export function groupByDayPart<T extends { time: string }>(
  doses: readonly T[],
): Array<{ part: DayPart; doses: T[] }> {
  const groups = new Map<DayPart, T[]>();
  for (const dose of doses) {
    const part = dayPartOf(dose.time);
    const list = groups.get(part) ?? [];
    list.push(dose);
    groups.set(part, list);
  }
  return DAY_PARTS.filter((p) => groups.has(p)).map((part) => ({ part, doses: groups.get(part)! }));
}

/** The next dose still to take: the first one that is due, else the first upcoming one. */
export function nextDose<T extends { state: string }>(doses: readonly T[]): T | null {
  return doses.find((d) => d.state === "due") ?? doses.find((d) => d.state === "upcoming") ?? null;
}
