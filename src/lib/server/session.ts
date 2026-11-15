import { cookies } from "next/headers";
import { can } from "../domain/permissions";
import { publicMember, publicProfile, resolveSession } from "../services/auth";
import { getDeps } from "./container";
import { SESSION_COOKIE } from "./http";

/** Loads the logged-in member for server components, or null if the session is missing or revoked. */
export async function getServerSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const actor = await resolveSession(await getDeps(), token);
    const member = publicMember(actor.member);
    return {
      profile: publicProfile(actor.profile),
      member: { id: member.id, name: member.name, email: member.email, role: member.role, permission: member.permission },
      can: { write: can(actor.member, "write"), manageCircle: can(actor.member, "manageCircle") },
    };
  } catch {
    return null;
  }
}
