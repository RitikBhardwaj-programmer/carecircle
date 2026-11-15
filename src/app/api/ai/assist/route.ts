import { NextResponse } from "next/server";
import { assistRequestSchema } from "@/lib/domain/schemas";
import { getTextModel } from "@/lib/infra/gemini";
import { openAIFromEnv, withFallback } from "@/lib/infra/openai";
import { aiLimiter } from "@/lib/infra/rate-limit";
import { assist } from "@/lib/services/assist";
import { authedRoute, rateLimit, readJson } from "@/lib/server/http";

const secondary = openAIFromEnv();

/**
 * "Ask CareCircle": answers from the member's own data or proposes one action.
 * It never writes; the UI asks the person to confirm. Gemini first, optional OpenAI fallback.
 */
export const POST = authedRoute(async ({ req, deps, actor }) => {
  rateLimit(aiLimiter, req);
  const input = await readJson(req, assistRequestSchema);
  const model = secondary ? withFallback(getTextModel(), secondary) : getTextModel();
  return NextResponse.json(await assist(model, deps, actor, input));
});
