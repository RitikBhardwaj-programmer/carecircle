import { NextResponse } from "next/server";
import { addMemberSchema } from "@/lib/domain/schemas";
import { addMember, listMembers } from "@/lib/services/members";
import { authedRoute, readJson } from "@/lib/server/http";

export const GET = authedRoute(async ({ deps, actor }) =>
  NextResponse.json({ members: await listMembers(deps, actor) }),
);

/** Elder only: adds a member and returns their one-time passcode. */
export const POST = authedRoute(async ({ req, deps, actor }) => {
  const input = await readJson(req, addMemberSchema);
  return NextResponse.json(await addMember(deps, actor, input), { status: 201 });
}, "manageCircle");
