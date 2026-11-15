import { randomUUID } from "node:crypto";
import type { Medication } from "@/lib/domain/types";
import { DryRunMailer } from "@/lib/infra/mailer";
import { MemoryRepo } from "@/lib/repo/memory-repo";
import { createProfile, login } from "@/lib/services/auth";
import type { Actor, Deps } from "@/lib/services/deps";
import { addMember } from "@/lib/services/members";

export const SECRET = "test-session-secret-that-is-long-enough-123456";

/** Fixed, movable clock for deterministic tests. */
export class FakeClock {
  constructor(public current: Date) {}
  now = (): Date => new Date(this.current);
  set(iso: string): void {
    this.current = new Date(iso);
  }
  advanceMinutes(min: number): void {
    this.current = new Date(this.current.getTime() + min * 60_000);
  }
}

export function makeDeps(nowIso = "2026-11-15T04:30:00.000Z") {
  const clock = new FakeClock(new Date(nowIso));
  const mailer = new DryRunMailer();
  const repo = new MemoryRepo();
  const deps: Deps = {
    repo,
    mailer,
    now: clock.now,
    newId: () => randomUUID(),
    secret: SECRET,
    appUrl: "https://care.example",
  };
  return { deps, clock, mailer, repo };
}

/** Creates a profile with an elder (with email) and returns the elder actor and passcode. */
export async function seedProfile(deps: Deps, email: string | null = "elder@example.com") {
  const created = await createProfile(deps, {
    elderName: "Asha Devi",
    email,
    timezone: "Asia/Kolkata",
    language: "en",
  });
  const elder: Actor = { profile: created.profile, member: created.member };
  return { ...created, elder };
}

export async function addAndLogin(
  deps: Deps,
  elder: Actor,
  opts: { role?: "family" | "caretaker"; permission?: "view" | "manage"; email?: string | null; notify?: boolean } = {},
): Promise<Actor & { passcode: string }> {
  const { member, passcode } = await addMember(deps, elder, {
    name: `${opts.role ?? "family"}-${opts.permission ?? "manage"}`,
    email: opts.email === undefined ? "family@example.com" : opts.email,
    role: opts.role ?? "family",
    permission: opts.permission ?? "manage",
    notify: opts.notify ?? true,
  });
  const res = await login(deps, elder.profile.code, passcode);
  expect(res.member.id).toBe(member.id);
  return { profile: res.profile, member: res.member, passcode };
}

export function med(overrides: Partial<Medication> = {}): Medication {
  return {
    id: "med-1",
    profileId: "p1",
    name: "Metformin",
    dosage: "500 mg",
    instructions: null,
    times: ["08:00", "20:00"],
    days: [],
    startDate: "2026-11-01",
    endDate: null,
    active: true,
    updatedBy: "Asha",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

export const medInput = {
  name: "Metformin",
  dosage: "500 mg",
  instructions: "After food",
  times: ["08:00", "20:00"],
  days: [] as number[],
  startDate: "2026-11-01",
  endDate: null,
  active: true,
};
