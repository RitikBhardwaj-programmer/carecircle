import { NextResponse } from "next/server";
import { createProfileSchema } from "@/lib/domain/schemas";
import { createProfileLimiter } from "@/lib/infra/rate-limit";
import { createProfile, publicMember, publicProfile, sessionTokenFor } from "@/lib/services/auth";
import { publicRoute, rateLimit, readJson, setSessionCookie } from "@/lib/server/http";

/** Creates a care profile. The creator is the elder; the passcode is shown once. */
export const POST = publicRoute(async ({ req, deps }) => {
  rateLimit(createProfileLimiter, req);
  const input = await readJson(req, createProfileSchema);
  const { profile, member, passcode } = await createProfile(deps, input);
  const res = NextResponse.json(
    { profile: publicProfile(profile), member: publicMember(member), passcode },
    { status: 201 },
  );
  setSessionCookie(res, sessionTokenFor(member, deps.now(), deps.secret));
  return res;
});
