import { NextResponse } from "next/server";
import { idParam } from "@/lib/domain/schemas";
import { publicMember, sessionTokenFor } from "@/lib/services/auth";
import { resetPasscode } from "@/lib/services/members";
import { authedRoute, parseWith, setSessionCookie } from "@/lib/server/http";

/**
 * Elder only: issues a new one-time passcode for a member (or the elder) and logs out
 * that member's other sessions. When the elder resets their own passcode, this browser stays logged in.
 */
export const POST = authedRoute<{ id: string }>(async ({ deps, actor, params }) => {
  const { member, passcode } = await resetPasscode(deps, actor, parseWith(idParam, params.id));
  const res = NextResponse.json({ member: publicMember(member), passcode });
  if (member.id === actor.member.id) setSessionCookie(res, sessionTokenFor(member, deps.now(), deps.secret));
  return res;
}, "manageCircle");
