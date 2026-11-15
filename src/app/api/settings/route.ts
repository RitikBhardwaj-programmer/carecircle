import { NextResponse } from "next/server";
import { settingsSchema } from "@/lib/domain/schemas";
import { updateSettings } from "@/lib/services/members";
import { authedRoute, readJson } from "@/lib/server/http";

/** Elder only: reminder timing, circle escalation and language. */
export const PUT = authedRoute(async ({ req, deps, actor }) =>
  NextResponse.json(await updateSettings(deps, actor, await readJson(req, settingsSchema))),
  "manageCircle",
);
