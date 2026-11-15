import { NextResponse, type NextRequest } from "next/server";
import { AppError } from "@/lib/errors";
import { getConfig } from "@/lib/infra/config";
import { logger } from "@/lib/infra/logger";
import { getIdTokenVerifier, isAuthorizedCron } from "@/lib/infra/oidc";
import { runReminders } from "@/lib/services/reminders";
import { getDeps } from "@/lib/server/container";
import { errorResponse } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/** Called by Cloud Scheduler every 5 minutes with an OIDC token. Idempotent. */
export async function POST(req: NextRequest): Promise<Response> {
  try {
    const config = getConfig();
    const ok = await isAuthorizedCron(req.headers, {
      audience: `${config.appUrl}/api/cron/reminders`,
      invokerEmail: config.cronInvokerEmail,
      devKey: config.cronDevKey,
      verify: getIdTokenVerifier(),
    });
    if (!ok) throw new AppError("UNAUTHORIZED", "Unauthorized.");
    const result = await runReminders(await getDeps());
    logger.info("cron.reminders", { ...result });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
