import { med } from "../../../tests/helpers";
import { notificationKey, planReminders, type ProfileSnapshot } from "./reminders";
import { DEFAULT_SETTINGS, type Appointment, type Member, type Profile } from "./types";

const profile: Profile = {
  id: "p1",
  code: "CARE-AAAA-BBBB",
  elderName: "Asha",
  timezone: "Asia/Kolkata",
  language: "en",
  settings: { ...DEFAULT_SETTINGS },
  failedLogins: 0,
  lockedUntil: null,
  createdAt: "2026-11-01T00:00:00Z",
};

function member(id: string, overrides: Partial<Member> = {}): Member {
  return {
    id,
    profileId: "p1",
    name: id,
    email: `${id}@example.com`,
    role: "family",
    permission: "manage",
    passcodeHash: "",
    salt: "",
    revokedAt: null,
    notify: true,
    createdAt: "2026-11-01T00:00:00Z",
    ...overrides,
  };
}

const elder = member("elder", { role: "elder" });
const son = member("son");

function snap(overrides: Partial<ProfileSnapshot> = {}): ProfileSnapshot {
  return {
    profile,
    members: [elder, son],
    medications: [med({ times: ["08:00"] })],
    loggedDoseIds: new Set(),
    appointments: [],
    ...overrides,
  };
}

// 08:00 IST on 15 Nov 2026 = 02:30 UTC.
const at = (hhmmUtc: string, day = "2026-11-15") => new Date(`${day}T${hhmmUtc}:00Z`);
const types = (rs: ReturnType<typeof planReminders>) => rs.map((r) => `${r.type}:${r.recipient.memberId}`);

describe("planReminders — doses", () => {
  it("sends nothing long before the dose", () => {
    expect(planReminders(at("01:00"), snap(), new Set())).toEqual([]);
  });

  it("sends the upcoming email to the elder 15 min before", () => {
    expect(types(planReminders(at("02:20"), snap(), new Set()))).toEqual(["dose-upcoming:elder"]);
  });

  it("sends the missed email to the elder after the grace period", () => {
    expect(types(planReminders(at("03:05"), snap(), new Set()))).toEqual(["dose-missed:elder"]);
  });

  it("escalates to the circle after 60 min, keeping the elder missed email", () => {
    expect(types(planReminders(at("03:35"), snap(), new Set()))).toEqual([
      "dose-missed:elder",
      "dose-escalation:son",
    ]);
  });

  it("does not escalate when the elder turned escalation off", () => {
    const p = { ...profile, settings: { ...profile.settings, escalateToCircle: false } };
    expect(types(planReminders(at("03:35"), snap({ profile: p }), new Set()))).toEqual(["dose-missed:elder"]);
  });

  it("sends nothing when the dose was logged between two runs", () => {
    const s = snap({ loggedDoseIds: new Set(["med-1_2026-11-15_0800"]) });
    expect(planReminders(at("03:35"), s, new Set())).toEqual([]);
  });

  it("skips keys that were already sent (second run at the same minute)", () => {
    const first = planReminders(at("03:35"), snap(), new Set());
    const second = planReminders(at("03:35"), snap(), new Set(first.map((r) => r.key)));
    expect(second).toEqual([]);
  });

  it("never sends alerts older than the 3 h look-back", () => {
    expect(planReminders(at("05:31"), snap(), new Set())).toEqual([]);
  });

  it("does not email revoked members or members without notify/email", () => {
    const members = [
      elder,
      member("revoked", { revokedAt: "2026-11-10T00:00:00Z" }),
      member("quiet", { notify: false }),
      member("noemail", { email: null }),
    ];
    expect(types(planReminders(at("03:35"), snap({ members }), new Set()))).toEqual(["dose-missed:elder"]);
  });

  it("handles the midnight boundary: a 23:50 dose is upcoming at 23:40 the day before", () => {
    // 23:50 IST on 15 Nov = 18:20 UTC; 23:40 IST = 18:10 UTC.
    const s = snap({ medications: [med({ times: ["23:50"] })] });
    const rs = planReminders(at("18:10"), s, new Set());
    expect(types(rs)).toEqual(["dose-upcoming:elder"]);
    expect(rs[0]?.dose?.id).toBe("med-1_2026-11-15_2350");
  });

  it("handles the midnight boundary: a 00:05 dose is upcoming at 23:55 the previous local day", () => {
    // 00:05 IST on 16 Nov = 18:35 UTC on 15 Nov.
    const s = snap({ medications: [med({ times: ["00:05"] })] });
    const rs = planReminders(at("18:25"), s, new Set());
    expect(rs.map((r) => r.dose?.id)).toEqual(["med-1_2026-11-16_0005"]);
  });

  it("does not send a missed email for yesterday's dose after midnight", () => {
    // 23:45 IST dose on 15 Nov, now 00:20 IST on 16 Nov (grace passed, but a new local day).
    const s = snap({ medications: [med({ times: ["23:45"] })], members: [elder] });
    expect(planReminders(at("18:50"), s, new Set())).toEqual([]);
  });

  it("ignores end-dated and non-daily medications on days they do not run", () => {
    const meds = [med({ id: "ended", endDate: "2026-11-14", times: ["08:00"] }), med({ id: "mon", days: [1], times: ["08:00"] })];
    expect(planReminders(at("03:05"), snap({ medications: meds }), new Set())).toEqual([]);
  });

  it("sends nothing to the elder when the elder has no email", () => {
    const s = snap({ members: [{ ...elder, email: null }, son] });
    expect(types(planReminders(at("03:05"), s, new Set()))).toEqual([]);
  });
});

describe("planReminders — appointments", () => {
  const appt: Appointment = {
    id: "a1",
    profileId: "p1",
    doctor: "Dr. Rao",
    purpose: "Eye check",
    location: null,
    at: "2026-11-16T05:00:00.000Z",
    notes: null,
    updatedBy: "x",
    updatedAt: "x",
  };
  const s = snap({ medications: [], appointments: [appt] });

  it("sends the 24 h email to elder and circle", () => {
    expect(types(planReminders(new Date("2026-11-15T06:00:00Z"), s, new Set()))).toEqual([
      "appt-24h:elder",
      "appt-24h:son",
    ]);
  });

  it("sends the 2 h email once within two hours", () => {
    expect(types(planReminders(new Date("2026-11-16T03:30:00Z"), s, new Set()))).toEqual([
      "appt-2h:elder",
      "appt-2h:son",
    ]);
  });

  it("sends nothing more than 24 h before or after the start", () => {
    expect(planReminders(new Date("2026-11-15T04:00:00Z"), s, new Set())).toEqual([]);
    expect(planReminders(new Date("2026-11-16T05:00:00Z"), s, new Set())).toEqual([]);
  });
});

describe("notificationKey", () => {
  it("is stable and differs per type, target and recipient", () => {
    const k = notificationKey("dose-missed", "d1", "m1");
    expect(k).toMatch(/^[a-f0-9]{64}$/);
    expect(notificationKey("dose-missed", "d1", "m1")).toBe(k);
    expect(new Set([k, notificationKey("dose-upcoming", "d1", "m1"), notificationKey("dose-missed", "d2", "m1"), notificationKey("dose-missed", "d1", "m2")]).size).toBe(4);
  });
});
