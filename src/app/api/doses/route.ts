import { NextResponse } from "next/server";
import { doseLogSchema } from "@/lib/domain/schemas";
import { adherenceSummary, logDose, todayDoses } from "@/lib/services/medications";
import { authedRoute, readJson } from "@/lib/server/http";

/** Today's doses with status, plus 7-day and 30-day adherence per medication. */
export const GET = authedRoute(async ({ deps, actor }) => {
  const [today, adherence] = await Promise.all([todayDoses(deps, actor), adherenceSummary(deps, actor)]);
  return NextResponse.json({ ...today, adherence });
});

/** Marks a dose taken or skipped. Idempotent: the log id is the dose id. */
export const POST = authedRoute(async ({ req, deps, actor }) => {
  const { doseId, status } = await readJson(req, doseLogSchema);
  return NextResponse.json({ log: await logDose(deps, actor, doseId, status) });
}, "write");
