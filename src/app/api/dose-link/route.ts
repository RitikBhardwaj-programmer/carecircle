import { NextResponse } from "next/server";
import { z } from "zod";
import { doseLinkLimiter } from "@/lib/infra/rate-limit";
import { confirmDoseLink } from "@/lib/services/reminders";
import { publicRoute, rateLimit, readJson } from "@/lib/server/http";

const bodySchema = z.object({ token: z.string().min(10).max(1024) });

/**
 * One-tap "mark as taken" from an email. Only POST writes, so mail scanners that
 * pre-open the GET link cannot mark a dose. The signed token is the credential.
 */
export const POST = publicRoute(async ({ req, deps }) => {
  rateLimit(doseLinkLimiter, req);
  const { token } = await readJson(req, bodySchema);
  return NextResponse.json(await confirmDoseLink(deps, token));
});
