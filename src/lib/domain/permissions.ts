import type { Member } from "./types";

/**
 * Actions a member can attempt.
 * - read: see the profile, medications, doses, appointments, activity
 * - write: add, edit, delete medications and appointments; log doses
 * - manageCircle: add, change or revoke members; change escalation settings (elder only)
 */
export type Action = "read" | "write" | "manageCircle";

type Level = "view" | "manage" | "elder";

const TABLE: Record<Level, ReadonlySet<Action>> = {
  view: new Set<Action>(["read"]),
  manage: new Set<Action>(["read", "write"]),
  elder: new Set<Action>(["read", "write", "manageCircle"]),
};

function levelOf(member: Pick<Member, "role" | "permission">): Level {
  if (member.role === "elder") return "elder";
  return member.permission;
}

/** Single permission check used by every route. Revoked members can do nothing. */
export function can(member: Pick<Member, "role" | "permission" | "revokedAt">, action: Action): boolean {
  if (member.revokedAt) return false;
  return TABLE[levelOf(member)].has(action);
}
