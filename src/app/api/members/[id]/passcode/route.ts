import { NextResponse } from "next/server";
import { idParam } from "@/lib/domain/schemas";
import { resetPasscode } from "@/lib/services/members";
import { authedRoute, parseWith } from "@/lib/server/http";

/** Elder only: issues a new one-time passcode for a member. */
export const POST = authedRoute<{ id: string }>(async ({ deps, actor, params }) =>
  NextResponse.json(await resetPasscode(deps, actor, parseWith(idParam, params.id))),
  "manageCircle",
);
