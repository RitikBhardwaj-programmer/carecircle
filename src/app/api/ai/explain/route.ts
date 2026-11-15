import { NextResponse } from "next/server";
import { explainSchema } from "@/lib/domain/schemas";
import { getTextModel } from "@/lib/infra/gemini";
import { aiLimiter } from "@/lib/infra/rate-limit";
import { explainMedicine } from "@/lib/services/ai";
import { authedRoute, rateLimit, readJson } from "@/lib/server/http";

/** Plain-language medicine explainer in English or Hindi. Always carries the "not medical advice" line. */
export const POST = authedRoute(async ({ req, actor }) => {
  rateLimit(aiLimiter, req);
  const input = await readJson(req, explainSchema);
  return NextResponse.json(await explainMedicine(getTextModel(), actor, input));
});
