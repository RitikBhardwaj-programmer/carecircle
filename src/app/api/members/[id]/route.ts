import { NextResponse } from "next/server";
import { idParam, updateMemberSchema } from "@/lib/domain/schemas";
import { revokeMember, updateMember } from "@/lib/services/members";
import { authedRoute, parseWith, readJson } from "@/lib/server/http";

type Params = { id: string };

export const PATCH = authedRoute<Params>(async ({ req, deps, actor, params }) => {
  const id = parseWith(idParam, params.id);
  const input = await readJson(req, updateMemberSchema);
  return NextResponse.json({ member: await updateMember(deps, actor, id, input) });
});

/** Revokes access. The member loses access on their next request. */
export const DELETE = authedRoute<Params>(async ({ deps, actor, params }) => {
  const id = parseWith(idParam, params.id);
  return NextResponse.json({ member: await revokeMember(deps, actor, id) });
});
