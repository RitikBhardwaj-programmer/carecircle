import { addAndLogin, makeDeps, medInput, seedProfile } from "../../../tests/helpers";
import { AppError } from "../errors";
import { createSessionToken } from "../security/tokens";
import {
  createAppointment,
  deleteAppointment,
  googleCalendarLink,
  listAppointments,
  updateAppointment,
} from "./appointments";
import { listActivity } from "./activity";
import { login, resolveSession } from "./auth";
import {
  adherenceSummary,
  createMedication,
  deleteMedication,
  listMedications,
  logDose,
  todayDoses,
  updateMedication,
} from "./medications";
import { addMember, listMembers, resetPasscode, revokeMember, updateMember, updateSettings } from "./members";

async function expectCode(p: Promise<unknown>, code: AppError["code"]) {
  await expect(p).rejects.toMatchObject({ code });
}

describe("auth service (R1)", () => {
  it("logs in with the right code and passcode", async () => {
    const { deps } = makeDeps();
    const { profile, passcode } = await seedProfile(deps);
    const res = await login(deps, profile.code, passcode);
    expect(res.member.role).toBe("elder");
    expect(res.token).toContain(".");
  });

  it("gives the same error for an unknown profile and a wrong passcode", async () => {
    const { deps } = makeDeps();
    const { profile } = await seedProfile(deps);
    const a = await login(deps, "CARE-ZZZZ-ZZZZ", "ABCDEFGH").catch((e: AppError) => e);
    const b = await login(deps, profile.code, "ABCDEFGH").catch((e: AppError) => e);
    expect(a).toBeInstanceOf(AppError);
    expect((a as AppError).message).toBe((b as AppError).message);
    expect((a as AppError).code).toBe("UNAUTHORIZED");
  });

  it("locks the profile for 15 minutes after 5 failures, even for the right passcode", async () => {
    const { deps, clock } = makeDeps();
    const { profile, passcode } = await seedProfile(deps);
    for (let i = 0; i < 4; i += 1) await expectCode(login(deps, profile.code, "WRONGPWD"), "UNAUTHORIZED");
    await expectCode(login(deps, profile.code, "WRONGPWD"), "LOCKED");
    await expectCode(login(deps, profile.code, passcode), "LOCKED");
    clock.advanceMinutes(16);
    await expect(login(deps, profile.code, passcode)).resolves.toBeTruthy();
    expect((await deps.repo.getProfile(profile.id))?.lockedUntil).toBeNull();
  });

  it("resolveSession rejects missing, invalid and revoked sessions", async () => {
    const { deps } = makeDeps();
    const { elder } = await seedProfile(deps);
    await expectCode(resolveSession(deps, undefined), "UNAUTHORIZED");
    await expectCode(resolveSession(deps, "garbage"), "UNAUTHORIZED");
    const fam = await addAndLogin(deps, elder);
    const token = createSessionToken(elder.profile.id, fam.member.id, deps.now(), deps.secret);
    await expect(resolveSession(deps, token)).resolves.toMatchObject({ member: { id: fam.member.id } });
    await revokeMember(deps, elder, fam.member.id);
    await expectCode(resolveSession(deps, token), "UNAUTHORIZED");
  });

  it("revoked members cannot log in", async () => {
    const { deps } = makeDeps();
    const { elder } = await seedProfile(deps);
    const fam = await addAndLogin(deps, elder);
    await revokeMember(deps, elder, fam.member.id);
    await expectCode(login(deps, elder.profile.code, fam.passcode), "UNAUTHORIZED");
  });
});

describe("members service (R2, R9)", () => {
  it("elder adds a member and gets a one-time passcode; hashes never leak", async () => {
    const { deps } = makeDeps();
    const { elder } = await seedProfile(deps);
    const { member, passcode } = await addMember(deps, elder, {
      name: "Ravi",
      email: null,
      role: "caretaker",
      permission: "view",
      notify: false,
    });
    expect(passcode).toMatch(/^[A-Z2-9]{8}$/);
    expect(member).not.toHaveProperty("passcodeHash");
    const list = await listMembers(deps, elder);
    expect(list.map((m) => m.name)).toEqual(["Asha Devi", "Ravi"]);
    expect(JSON.stringify(list)).not.toContain("salt");
  });

  it("family and caretakers cannot add members or change escalation", async () => {
    const { deps } = makeDeps();
    const { elder } = await seedProfile(deps);
    const fam = await addAndLogin(deps, elder, { permission: "manage" });
    await expectCode(
      addMember(deps, fam, { name: "X", email: null, role: "family", permission: "manage", notify: true }),
      "FORBIDDEN",
    );
    await expectCode(
      updateSettings(deps, fam, { upcomingLeadMin: 15, missedGraceMin: 30, escalateToCircle: false, escalateAfterMin: 60 }),
      "FORBIDDEN",
    );
    await expectCode(revokeMember(deps, fam, elder.member.id), "FORBIDDEN");
  });

  it("elder changes settings, member permission and passcode", async () => {
    const { deps } = makeDeps();
    const { elder } = await seedProfile(deps);
    const fam = await addAndLogin(deps, elder);
    const s = await updateSettings(deps, elder, {
      upcomingLeadMin: 10,
      missedGraceMin: 45,
      escalateToCircle: false,
      escalateAfterMin: 90,
      language: "hi",
    });
    expect(s.language).toBe("hi");
    expect((await deps.repo.getProfile(elder.profile.id))?.settings.escalateToCircle).toBe(false);
    expect((await updateMember(deps, elder, fam.member.id, { permission: "view" })).permission).toBe("view");
    const { passcode } = await resetPasscode(deps, elder, fam.member.id);
    await expectCode(login(deps, elder.profile.code, fam.passcode), "UNAUTHORIZED");
    await expect(login(deps, elder.profile.code, passcode)).resolves.toBeTruthy();
  });

  it("the elder cannot be revoked or downgraded; unknown members are 404", async () => {
    const { deps } = makeDeps();
    const { elder } = await seedProfile(deps);
    await expectCode(revokeMember(deps, elder, elder.member.id), "BAD_REQUEST");
    await expectCode(updateMember(deps, elder, elder.member.id, { permission: "view" }), "BAD_REQUEST");
    await expectCode(revokeMember(deps, elder, "nope"), "NOT_FOUND");
  });

  it("revoking twice is harmless and logs activity", async () => {
    const { deps } = makeDeps();
    const { elder } = await seedProfile(deps);
    const fam = await addAndLogin(deps, elder);
    await revokeMember(deps, elder, fam.member.id);
    const again = await revokeMember(deps, elder, fam.member.id);
    expect(again.revokedAt).not.toBeNull();
    await expectCode(resetPasscode(deps, elder, fam.member.id), "BAD_REQUEST");
    const activity = await listActivity(deps, elder);
    expect(activity.some((a) => a.action === "revoked access of")).toBe(true);
  });
});

describe("medications service (R3, R4)", () => {
  it("supports create, list, update and delete", async () => {
    const { deps } = makeDeps();
    const { elder } = await seedProfile(deps);
    const m = await createMedication(deps, elder, medInput);
    expect((await listMedications(deps, elder)).map((x) => x.id)).toEqual([m.id]);
    const u = await updateMedication(deps, elder, m.id, { ...medInput, dosage: "1000 mg" });
    expect(u.dosage).toBe("1000 mg");
    expect(u.updatedBy).toBe("Asha Devi");
    await deleteMedication(deps, elder, m.id);
    expect(await listMedications(deps, elder)).toEqual([]);
    await expectCode(updateMedication(deps, elder, m.id, medInput), "NOT_FOUND");
  });

  it("view members can read but not write", async () => {
    const { deps } = makeDeps();
    const { elder } = await seedProfile(deps);
    const viewer = await addAndLogin(deps, elder, { permission: "view" });
    const m = await createMedication(deps, elder, medInput);
    await expect(listMedications(deps, viewer)).resolves.toHaveLength(1);
    await expectCode(createMedication(deps, viewer, medInput), "FORBIDDEN");
    await expectCode(deleteMedication(deps, viewer, m.id), "FORBIDDEN");
    await expectCode(logDose(deps, viewer, `${m.id}_2026-11-15_0800`, "taken"), "FORBIDDEN");
  });

  it("today view shows states and marking a dose updates it idempotently", async () => {
    // 10:00 IST on 15 Nov.
    const { deps } = makeDeps("2026-11-15T04:30:00.000Z");
    const { elder } = await seedProfile(deps);
    const m = await createMedication(deps, elder, medInput);
    const before = await todayDoses(deps, elder);
    expect(before.date).toBe("2026-11-15");
    expect(before.doses.map((d) => d.state)).toEqual(["missed", "upcoming"]);
    const id = `${m.id}_2026-11-15_0800`;
    await logDose(deps, elder, id, "taken");
    await logDose(deps, elder, id, "taken");
    const after = await todayDoses(deps, elder);
    expect(after.doses.map((d) => d.state)).toEqual(["taken", "upcoming"]);
    expect(after.doses[0]?.loggedBy).toBe("Asha Devi");
    expect(await deps.repo.listDoseLogs(elder.profile.id, "2026-11-15", "2026-11-15")).toHaveLength(1);
  });

  it("rejects malformed, unscheduled, future and old doses", async () => {
    const { deps } = makeDeps("2026-11-15T04:30:00.000Z");
    const { elder } = await seedProfile(deps);
    const m = await createMedication(deps, elder, medInput);
    await expectCode(logDose(deps, elder, "nonsense", "taken"), "BAD_REQUEST");
    await expectCode(logDose(deps, elder, `${m.id}_2026-11-15_0900`, "taken"), "NOT_FOUND");
    await expectCode(logDose(deps, elder, `${m.id}_2026-11-16_0800`, "taken"), "BAD_REQUEST");
    await expectCode(logDose(deps, elder, `${m.id}_2026-11-02_0800`, "taken"), "BAD_REQUEST");
    await expectCode(logDose(deps, elder, `unknown_2026-11-15_0800`, "taken"), "NOT_FOUND");
  });

  it("adherence summary reports 7-day and 30-day rates", async () => {
    const { deps } = makeDeps("2026-11-15T16:00:00.000Z");
    const { elder } = await seedProfile(deps);
    const m = await createMedication(deps, elder, { ...medInput, startDate: "2026-11-15" });
    await logDose(deps, elder, `${m.id}_2026-11-15_0800`, "taken");
    const [row] = await adherenceSummary(deps, elder);
    expect(row?.week).toMatchObject({ due: 2, taken: 1, missed: 1, rate: 50 });
    expect(row?.month.rate).toBe(50);
  });
});

describe("appointments service (R5)", () => {
  const input = { doctor: "Dr. Rao", purpose: "Eye check", location: null, notes: null };

  it("sorts upcoming soonest first and moves past ones to history", async () => {
    const { deps, clock } = makeDeps("2026-11-15T04:30:00.000Z");
    const { elder } = await seedProfile(deps);
    const later = await createAppointment(deps, elder, { ...input, at: "2026-11-20T05:00:00.000Z" });
    const sooner = await createAppointment(deps, elder, { ...input, at: "2026-11-16T05:00:00.000Z" });
    await createAppointment(deps, elder, { ...input, at: "2026-11-10T05:00:00.000Z" });
    let list = await listAppointments(deps, elder);
    expect(list.upcoming.map((a) => a.id)).toEqual([sooner.id, later.id]);
    expect(list.past).toHaveLength(1);
    clock.set("2026-11-17T00:00:00.000Z");
    list = await listAppointments(deps, elder);
    expect(list.upcoming.map((a) => a.id)).toEqual([later.id]);
    expect(list.past[0]?.id).toBe(sooner.id);
  });

  it("supports update and delete with permission checks", async () => {
    const { deps } = makeDeps();
    const { elder } = await seedProfile(deps);
    const viewer = await addAndLogin(deps, elder, { permission: "view" });
    const a = await createAppointment(deps, elder, { ...input, at: "2026-11-20T05:00:00.000Z" });
    expect((await updateAppointment(deps, elder, a.id, { ...input, purpose: "Follow-up", at: a.at })).purpose).toBe(
      "Follow-up",
    );
    await expectCode(deleteAppointment(deps, viewer, a.id), "FORBIDDEN");
    await deleteAppointment(deps, elder, a.id);
    await expectCode(deleteAppointment(deps, elder, a.id), "NOT_FOUND");
  });

  it("builds a Google Calendar template link", () => {
    const link = googleCalendarLink(
      {
        id: "a",
        profileId: "p",
        doctor: "Dr. Rao",
        purpose: "Eye check",
        location: "City Clinic",
        at: "2026-11-20T05:00:00.000Z",
        notes: null,
        updatedBy: "x",
        updatedAt: "x",
      },
      "Asha",
    );
    const url = new URL(link);
    expect(url.hostname).toBe("calendar.google.com");
    expect(url.searchParams.get("dates")).toBe("20261120T050000Z/20261120T060000Z");
    expect(url.searchParams.get("text")).toBe("Asha: Dr. Rao");
  });
});
