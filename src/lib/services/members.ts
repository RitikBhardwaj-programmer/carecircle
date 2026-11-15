import type { AddMemberInput, SettingsInput, UpdateMemberInput } from "../domain/schemas";
import type { Member } from "../domain/types";
import { AppError } from "../errors";
import { generatePasscode, hashPasscode } from "../security/passcode";
import { authorize, publicMember } from "./auth";
import { recordActivity, type Actor, type Deps } from "./deps";

const MAX_MEMBERS = 20;

export async function listMembers(deps: Deps, actor: Actor) {
  authorize(actor, "read");
  const members = await deps.repo.listMembers(actor.profile.id);
  return members.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(publicMember);
}

/** Elder only. Returns the new member and their one-time passcode. */
export async function addMember(deps: Deps, actor: Actor, input: AddMemberInput) {
  authorize(actor, "manageCircle");
  const existing = await deps.repo.listMembers(actor.profile.id);
  if (existing.filter((m) => !m.revokedAt).length >= MAX_MEMBERS) {
    throw new AppError("CONFLICT", `A circle can have at most ${MAX_MEMBERS} members.`);
  }
  const passcode = generatePasscode();
  const { hash, salt } = await hashPasscode(passcode);
  const member: Member = {
    id: deps.newId(),
    profileId: actor.profile.id,
    name: input.name,
    email: input.email ?? null,
    role: input.role,
    permission: input.permission,
    passcodeHash: hash,
    salt,
    revokedAt: null,
    notify: input.notify,
    createdAt: deps.now().toISOString(),
  };
  await deps.repo.saveMember(member);
  await recordActivity(deps, actor, `added ${input.role} with ${input.permission} access`, member.name);
  return { member: publicMember(member), passcode };
}

async function loadOther(deps: Deps, actor: Actor, memberId: string): Promise<Member> {
  const member = await deps.repo.getMember(actor.profile.id, memberId);
  if (!member) throw new AppError("NOT_FOUND", "Member not found.");
  return member;
}

/** Elder only. Changes permission, notify or email of a member. */
export async function updateMember(deps: Deps, actor: Actor, memberId: string, input: UpdateMemberInput) {
  authorize(actor, "manageCircle");
  const member = await loadOther(deps, actor, memberId);
  if (member.role === "elder" && input.permission) {
    throw new AppError("BAD_REQUEST", "The elder always keeps full access.");
  }
  const updated: Member = {
    ...member,
    ...(input.permission ? { permission: input.permission } : {}),
    ...(input.notify !== undefined ? { notify: input.notify } : {}),
    ...(input.email !== undefined ? { email: input.email ?? null } : {}),
  };
  await deps.repo.saveMember(updated);
  await recordActivity(deps, actor, "updated member", member.name);
  return publicMember(updated);
}

/** Elder only. Revoked members lose access on their next request. */
export async function revokeMember(deps: Deps, actor: Actor, memberId: string) {
  authorize(actor, "manageCircle");
  const member = await loadOther(deps, actor, memberId);
  if (member.role === "elder") throw new AppError("BAD_REQUEST", "The elder cannot be revoked.");
  if (member.revokedAt) return publicMember(member);
  const updated = { ...member, revokedAt: deps.now().toISOString() };
  await deps.repo.saveMember(updated);
  await recordActivity(deps, actor, "revoked access of", member.name);
  return publicMember(updated);
}

/** Elder only. Issues a new passcode; the old one stops working at once. */
export async function resetPasscode(deps: Deps, actor: Actor, memberId: string) {
  authorize(actor, "manageCircle");
  const member = await loadOther(deps, actor, memberId);
  if (member.revokedAt) throw new AppError("BAD_REQUEST", "This member is revoked.");
  const passcode = generatePasscode();
  const { hash, salt } = await hashPasscode(passcode);
  await deps.repo.saveMember({ ...member, passcodeHash: hash, salt });
  await recordActivity(deps, actor, "issued a new passcode for", member.name);
  return { member: publicMember(member), passcode };
}

/** Elder only. Escalation and reminder timing stay the elder's decision. */
export async function updateSettings(deps: Deps, actor: Actor, input: SettingsInput) {
  authorize(actor, "manageCircle");
  const { language, ...settings } = input;
  await deps.repo.updateProfile(actor.profile.id, { settings, ...(language ? { language } : {}) });
  await recordActivity(
    deps,
    actor,
    `changed reminder settings (circle alerts ${settings.escalateToCircle ? "on" : "off"})`,
    actor.profile.elderName,
  );
  return { settings, language: language ?? actor.profile.language };
}
