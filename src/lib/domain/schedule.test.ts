import { med } from "../../../tests/helpers";
import { doseId, doseState, dosesForDay, isScheduledOn, parseDoseId } from "./schedule";
import type { DoseLog } from "./types";

const TZ = "Asia/Kolkata";

describe("dose ids", () => {
  it("are deterministic and round-trip", () => {
    const id = doseId("med-1", "2026-11-15", "08:00");
    expect(id).toBe("med-1_2026-11-15_0800");
    expect(parseDoseId(id)).toEqual({ medicationId: "med-1", date: "2026-11-15", time: "08:00" });
  });

  it.each(["", "med-1", "med-1_2026-11-15_2500", "med 1_2026-11-15_0800", "a_b_c", "med-1_2026-11-15_0860"])(
    "rejects malformed id %j",
    (bad) => expect(parseDoseId(bad)).toBeNull(),
  );
});

describe("dosesForDay", () => {
  it("returns one dose per time, sorted, with UTC instants", () => {
    const doses = dosesForDay(med({ times: ["20:00", "08:00"] }), "2026-11-15", TZ);
    expect(doses.map((d) => d.time)).toEqual(["08:00", "20:00"]);
    expect(doses[0]?.at).toBe("2026-11-15T02:30:00.000Z");
    expect(doses[0]?.id).toBe("med-1_2026-11-15_0800");
  });

  it.each([
    ["before start date", med({ startDate: "2026-11-16" }), "2026-11-15", 0],
    ["after end date", med({ endDate: "2026-11-14" }), "2026-11-15", 0],
    ["on end date", med({ endDate: "2026-11-15" }), "2026-11-15", 2],
    ["inactive", med({ active: false }), "2026-11-15", 0],
    ["non-daily, Sunday listed", med({ days: [0, 3] }), "2026-11-15", 2],
    ["non-daily, Monday not listed", med({ days: [0, 3] }), "2026-11-16", 0],
  ])("%s", (_label, m, date, count) => {
    expect(dosesForDay(m, date, TZ)).toHaveLength(count);
    expect(isScheduledOn(m, date)).toBe(count > 0);
  });
});

describe("doseState", () => {
  const dose = dosesForDay(med({ times: ["08:00"] }), "2026-11-15", TZ)[0]!;
  const settings = { missedGraceMin: 30 };
  const log = (status: "taken" | "skipped"): DoseLog => ({
    id: dose.id,
    medicationId: "med-1",
    date: dose.date,
    time: dose.time,
    status,
    byMemberId: "m",
    byName: "M",
    via: "app",
    at: dose.at,
  });

  it.each([
    ["2026-11-15T02:00:00Z", undefined, "upcoming"],
    ["2026-11-15T02:30:00Z", undefined, "due"],
    ["2026-11-15T02:59:00Z", undefined, "due"],
    ["2026-11-15T03:00:00Z", undefined, "missed"],
    ["2026-11-15T03:00:00Z", "taken", "taken"],
    ["2026-11-15T01:00:00Z", "skipped", "skipped"],
  ] as const)("at %s with log %s is %s", (now, status, expected) => {
    expect(doseState(dose, status ? log(status) : undefined, new Date(now), settings)).toBe(expected);
  });
});
