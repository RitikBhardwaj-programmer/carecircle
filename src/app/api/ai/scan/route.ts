import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { getTextModel } from "@/lib/infra/gemini";
import { aiLimiter } from "@/lib/infra/rate-limit";
import { MAX_IMAGE_BYTES, scanPrescription } from "@/lib/services/ai";
import { authedRoute, rateLimit } from "@/lib/server/http";

/** Prescription photo (multipart field "image") → draft schedule. The image is not stored. */
export const POST = authedRoute(async ({ req, actor }) => {
  rateLimit(aiLimiter, req);
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > MAX_IMAGE_BYTES + 64 * 1024) throw new AppError("BAD_REQUEST", "The photo must be smaller than 4 MB.");
  const form = await req.formData().catch(() => null);
  const file = form?.get("image");
  if (!file || typeof file === "string") throw new AppError("BAD_REQUEST", "Attach a photo of the prescription.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const drafts = await scanPrescription(getTextModel(), actor, { mimeType: file.type, bytes });
  return NextResponse.json({ drafts });
});
