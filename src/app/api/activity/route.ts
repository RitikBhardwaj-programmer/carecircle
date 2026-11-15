import { NextResponse } from "next/server";
import { listActivity } from "@/lib/services/activity";
import { authedRoute } from "@/lib/server/http";

/** Append-only log of who changed what. */
export const GET = authedRoute(async ({ deps, actor }) =>
  NextResponse.json({ activity: await listActivity(deps, actor, 100) }),
);
