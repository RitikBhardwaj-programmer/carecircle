import { NextResponse } from "next/server";
import { assistRequestSchema } from "@/lib/domain/schemas";
import { getTextModel } from "@/lib/infra/gemini";
import { aiLimiter } from "@/lib/infra/rate-limit";
import { assist } from "@/lib/services/assist";
import { authedRoute, rateLimit, readJson } from "@/lib/server/http";

/**
 * "Ask CareCircle": answers from the member's own data or proposes one action, using Gemini on Vertex AI.
 * It never writes; the UI asks the person to confirm. If Gemini fails, it returns a friendly answer.
 */
export const POST = authedRoute(async ({ req, deps, actor }) => {
  rateLimit(aiLimiter, req);
  const input = await readJson(req, assistRequestSchema);
  return NextResponse.json(await assist(getTextModel(), deps, actor, input));
});
