import { can, type Action } from "../domain/permissions";
import type { CreateProfileInput } from "../domain/schemas";
import { DEFAULT_SETTINGS, type Member, type Profile } from "../domain/types";
import { AppError } from "../errors";
import {
  generatePasscode,
  generateProfileCode,
  hashPasscode,
  verifyPasscode,
} from "../security/passcode";
import { createSessionToken, verifySessionToken } from "../security/tokens";
import { recordActivity, type Actor, type Deps } from "./deps";

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MS = 15 * 60 * 1000;
const INVALID_LOGIN = "Profile code or passcode is incorrect.";

/** Public view of a member: never includes the hash or salt. */
export function publicMember(m: Member) {
  return {
    id: m.id,
    name: m.name,
    email: m.email,
    role: m.role,
    permission: m.role === "elder" ? ("manage" as const) : m.permission,
    notify: m.notify,
    revokedAt: m.revokedAt,
    createdAt: m.createdAt,
  };
}

/** Public view of a profile: no lockout counters. */
export function publicProfile(p: Profile) {
  return {
    id: p.id,
    code: p.code,
    elderName: p.elderName,
    timezone: p.timezone,
    language: p.language,
    settings: p.settings,
  };
}

/** Creates a profile and its elder member. The passcode is returned once and never stored in clear. */
export async function createProfile(deps: Deps, input: CreateProfileInput) {
  const now = deps.now().toISOString();
  let code = generateProfileCode();
  // Codes have ~10^12 combinations; retry on the very unlikely collision.
  for (let i = 0; i < 3 && (await deps.repo.findProfileByCode(code)); i += 1) code = generateProfileCode();

  const profile: Profile = {
    id: deps.newId(),
    code,
    elderName: input.elderName,
    timezone: input.timezone,
    language: input.language,
    settings: { ...DEFAULT_SETTINGS },
    failedLogins: 0,
    lockedUntil: null,
    createdAt: now,
  };
  const passcode = generatePasscode();
  const { hash, salt } = await hashPasscode(passcode);
  const elder: Member = {
    id: deps.newId(),
    profileId: profile.id,
    name: input.elderName,
    email: input.email ?? null,
    role: "elder",
    permission: "manage",
    passcodeHash: hash,
    salt,
    revokedAt: null,
    notify: true,
    createdAt: now,
  };
  await deps.repo.createProfile(profile, elder);
  await recordActivity(deps, { profile, member: elder }, "created the profile", profile.elderName);
  return { profile, member: elder, passcode };
}

// Burns the same scrypt time for unknown profiles so response time does not reveal valid codes.
const DUMMY = hashPasscode("AAAAAAAA");

/**
 * Logs in with profile code + passcode.
 * Same error for unknown profile and wrong passcode; 5 failures lock the profile for 15 minutes.
 */
export async function login(deps: Deps, code: string, passcode: string): Promise<Actor & { token: string }> {
  const now = deps.now();
  const profile = await deps.repo.findProfileByCode(code);
  if (!profile) {
    const d = await DUMMY;
    await verifyPasscode(passcode, d.hash, d.salt);
    throw new AppError("UNAUTHORIZED", INVALID_LOGIN);
  }
  if (profile.lockedUntil && Date.parse(profile.lockedUntil) > now.getTime()) {
    throw new AppError("LOCKED", "Too many wrong attempts. Try again in 15 minutes.");
  }
  const members = (await deps.repo.listMembers(profile.id)).filter((m) => !m.revokedAt);
  let match: Member | null = null;
  for (const m of members) {
    if (await verifyPasscode(passcode, m.passcodeHash, m.salt)) {
      match = m;
      break;
    }
  }
  if (!match) {
    const updated = await deps.repo.recordFailedLogin(profile.id, now, MAX_FAILED_LOGINS, LOCK_MS);
    if (updated.lockedUntil && Date.parse(updated.lockedUntil) > now.getTime()) {
      throw new AppError("LOCKED", "Too many wrong attempts. Try again in 15 minutes.");
    }
    throw new AppError("UNAUTHORIZED", INVALID_LOGIN);
  }
  if (profile.failedLogins > 0 || profile.lockedUntil) {
    await deps.repo.updateProfile(profile.id, { failedLogins: 0, lockedUntil: null });
  }
  const token = createSessionToken(profile.id, match.id, now, deps.secret);
  return { profile, member: match, token };
}

/** Resolves a session cookie to the current member. A revoked member fails at once. */
export async function resolveSession(deps: Deps, token: string | undefined): Promise<Actor> {
  const claims = token ? verifySessionToken(token, deps.now(), deps.secret) : null;
  if (!claims) throw new AppError("UNAUTHORIZED", "Please log in.");
  const [profile, member] = await Promise.all([
    deps.repo.getProfile(claims.profileId),
    deps.repo.getMember(claims.profileId, claims.memberId),
  ]);
  if (!profile || !member || member.revokedAt) throw new AppError("UNAUTHORIZED", "Please log in.");
  return { profile, member };
}

/** Throws FORBIDDEN unless the actor may perform the action. */
export function authorize(actor: Actor, action: Action): void {
  if (!can(actor.member, action)) {
    throw new AppError("FORBIDDEN", "You do not have permission to do this.");
  }
}
