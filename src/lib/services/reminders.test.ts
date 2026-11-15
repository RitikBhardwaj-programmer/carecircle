import { addAndLogin, makeDeps, medInput, seedProfile } from "../../../tests/helpers";
import type { Mailer } from "../infra/mailer";
import { createAppointment } from "./appointments";
import { createMedication, logDose, todayDoses } from "./medications";
import { updateSettings } from "./members";
import { confirmDoseLink, describeDoseLink, runReminders } from "./reminders";
import { revokeMember } from "./members";

describe("runReminders (R6, R7, R8, R12)", () => {
  it("sends once, and a second run sends nothing new", async () => {
    // 08:35 IST: the 08:00 dose is missed.
    const { deps, mailer } = makeDeps("2026-11-15T03:05:00.000Z");
    const { elder } = await seedProfile(deps);
    await createMedication(deps, elder, medInput);
    const first = await runReminders(deps);
    expect(first).toMatchObject({ profiles: 1, sent: 1, failed: 0 });
    expect(mailer.sent[0]?.tag).toBe("dose-missed");
    const second = await runReminders(deps);
    expect(second.sent).toBe(0);
    expect(mailer.sent).toHaveLength(1);
  });

  it("escalates to notified circle members and includes the one-tap link for writers only", async () => {
    const { deps, mailer } = makeDeps("2026-11-15T03:35:00.000Z");
    const { elder } = await seedProfile(deps);
    await addAndLogin(deps, elder, { permission: "manage", email: "son@example.com" });
    await addAndLogin(deps, elder, { role: "caretaker", permission: "view", email: "nurse@example.com" });
    await createMedication(deps, elder, medInput);
    await runReminders(deps);
    const byTo = new Map(mailer.sent.map((m) => [m.to, m]));
    expect([...byTo.keys()].sort()).toEqual(["elder@example.com", "nurse@example.com", "son@example.com"]);
    expect(byTo.get("son@example.com")?.text).toContain("/dose/");
    expect(byTo.get("nurse@example.com")?.text).not.toContain("/dose/");
  });

  it("respects the elder's choice to turn escalation off", async () => {
    const { deps, mailer } = makeDeps("2026-11-15T03:35:00.000Z");
    const { elder } = await seedProfile(deps);
    await addAndLogin(deps, elder, { email: "son@example.com" });
    await updateSettings(deps, elder, { upcomingLeadMin: 15, missedGraceMin: 30, escalateToCircle: false, escalateAfterMin: 60 });
    await createMedication(deps, { ...elder, profile: (await deps.repo.getProfile(elder.profile.id))! }, medInput);
    await runReminders(deps);
    expect(mailer.sent.map((m) => m.to)).toEqual(["elder@example.com"]);
  });

  it("sends nothing for a dose logged between two runs", async () => {
    const { deps, mailer, clock } = makeDeps("2026-11-15T02:20:00.000Z");
    const { elder } = await seedProfile(deps);
    const m = await createMedication(deps, elder, medInput);
    await runReminders(deps);
    expect(mailer.sent.map((x) => x.tag)).toEqual(["dose-upcoming"]);
    await logDose(deps, elder, `${m.id}_2026-11-15_0800`, "taken");
    clock.set("2026-11-15T03:40:00.000Z");
    await runReminders(deps);
    expect(mailer.sent).toHaveLength(1);
  });

  it("does not email a revoked member", async () => {
    const { deps, mailer } = makeDeps("2026-11-15T03:35:00.000Z");
    const { elder } = await seedProfile(deps, null);
    const fam = await addAndLogin(deps, elder, { email: "son@example.com" });
    await revokeMember(deps, elder, fam.member.id);
    await createMedication(deps, elder, medInput);
    await runReminders(deps);
    expect(mailer.sent).toHaveLength(0);
  });

  it("sends appointment reminders 24 h and 2 h before, once each", async () => {
    const { deps, mailer, clock } = makeDeps("2026-11-15T06:00:00.000Z");
    const { elder } = await seedProfile(deps);
    await createAppointment(deps, elder, {
      doctor: "Dr. Rao",
      purpose: "Eye check",
      location: null,
      notes: null,
      at: "2026-11-16T05:00:00.000Z",
    });
    await runReminders(deps);
    await runReminders(deps);
    clock.set("2026-11-16T03:30:00.000Z");
    await runReminders(deps);
    await runReminders(deps);
    expect(mailer.sent.map((m) => m.tag)).toEqual(["appt-24h", "appt-2h"]);
  });

  it("releases the key when sending fails so the next run retries", async () => {
    const { deps } = makeDeps("2026-11-15T03:05:00.000Z");
    const { elder } = await seedProfile(deps);
    await createMedication(deps, elder, medInput);
    const failing: Mailer = { mode: "smtp", send: () => Promise.reject(new Error("SMTP down")) };
    const r1 = await runReminders({ ...deps, mailer: failing });
    expect(r1).toMatchObject({ sent: 0, failed: 1 });
    const r2 = await runReminders(deps);
    expect(r2.sent).toBe(1);
  });
});

describe("one-tap dose link", () => {
  it("GET-style describe changes nothing; confirm marks the dose taken via email", async () => {
    const { deps, mailer } = makeDeps("2026-11-15T03:05:00.000Z");
    const { elder } = await seedProfile(deps);
    await createMedication(deps, elder, medInput);
    await runReminders(deps);
    const link = /\/dose\/([A-Za-z0-9_.-]+)/.exec(mailer.sent[0]?.text ?? "")?.[1];
    expect(link).toBeTruthy();
    const info = await describeDoseLink(deps, link!);
    expect(info.medication).toBe("Metformin (500 mg)");
    expect((await todayDoses(deps, elder)).doses[0]?.state).toBe("missed");
    const res = await confirmDoseLink(deps, link!);
    expect(res.status).toBe("taken");
    const today = await todayDoses(deps, elder);
    expect(today.doses[0]?.state).toBe("taken");
    const logs = await deps.repo.listDoseLogs(elder.profile.id, "2026-11-15", "2026-11-15");
    expect(logs[0]?.via).toBe("email");
  });

  it("rejects tampered and expired links", async () => {
    const { deps, mailer, clock } = makeDeps("2026-11-15T03:05:00.000Z");
    const { elder } = await seedProfile(deps);
    await createMedication(deps, elder, medInput);
    await runReminders(deps);
    const link = /\/dose\/([A-Za-z0-9_.-]+)/.exec(mailer.sent[0]?.text ?? "")?.[1] ?? "";
    await expect(describeDoseLink(deps, `${link}x`)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    clock.advanceMinutes(25 * 60);
    await expect(confirmDoseLink(deps, link)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
