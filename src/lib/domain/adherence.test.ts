import { med } from "../../../tests/helpers";
import { adherenceFor } from "./adherence";
import { doseId } from "./schedule";
import type { DoseLog } from "./types";

const TZ = "Asia/Kolkata";

function logs(entries: Array<[string, string, "taken" | "skipped"]>): Map<string, DoseLog> {
  return new Map(
    entries.map(([date, time, status]) => {
      const id = doseId("med-1", date, time);
      return [id, { id, medicationId: "med-1", date, time, status, byMemberId: "m", byName: "M", via: "app", at: "" }];
    }),
  );
}

describe("adherenceFor", () => {
  const m = med({ times: ["08:00", "20:00"], startDate: "2026-11-09" });

  it("counts only doses past their grace period", () => {
    // 15 Nov 10:00 IST: today's 08:00 is judged (grace 30 min), 20:00 is not.
    const now = new Date("2026-11-15T04:30:00Z");
    const s = adherenceFor(m, logs([["2026-11-15", "08:00", "taken"]]), "2026-11-15", 1, now, TZ, 30);
    expect(s).toEqual({ due: 1, taken: 1, skipped: 0, missed: 0, rate: 100 });
  });

  it("computes 7-day rate with taken, skipped and missed doses", () => {
    const now = new Date("2026-11-15T16:00:00Z"); // 21:30 IST, both doses judged today
    const l = logs([
      ["2026-11-15", "08:00", "taken"],
      ["2026-11-15", "20:00", "skipped"],
      ["2026-11-14", "08:00", "taken"],
      ["2026-11-14", "20:00", "taken"],
    ]);
    const s = adherenceFor(m, l, "2026-11-15", 7, now, TZ, 30);
    expect(s.due).toBe(14);
    expect(s.taken).toBe(3);
    expect(s.skipped).toBe(1);
    expect(s.missed).toBe(10);
    expect(s.rate).toBe(21);
  });

  it("returns null rate when nothing is due yet", () => {
    const fresh = med({ startDate: "2026-11-15", times: ["20:00"] });
    const s = adherenceFor(fresh, new Map(), "2026-11-15", 7, new Date("2026-11-15T04:30:00Z"), TZ, 30);
    expect(s.rate).toBeNull();
    expect(s.due).toBe(0);
  });

  it("counts an early log even before the grace period ends", () => {
    const now = new Date("2026-11-15T14:00:00Z"); // 19:30 IST, 20:00 dose not yet due
    const s = adherenceFor(
      med({ startDate: "2026-11-15", times: ["20:00"] }),
      logs([["2026-11-15", "20:00", "taken"]]),
      "2026-11-15",
      1,
      now,
      TZ,
      30,
    );
    expect(s).toMatchObject({ due: 1, taken: 1, rate: 100 });
  });
});
