import { NextResponse } from "next/server";
import { loginSchema } from "@/lib/domain/schemas";
import { loginLimiter } from "@/lib/infra/rate-limit";
import { login, publicMember, publicProfile } from "@/lib/services/auth";
import { publicRoute, rateLimit, readJson, setSessionCookie } from "@/lib/server/http";

export const POST = publicRoute(async ({ req, deps }) => {
  rateLimit(loginLimiter, req);
  const { code, passcode } = await readJson(req, loginSchema);
  const { profile, member, token } = await login(deps, code, passcode);
  const res = NextResponse.json({ profile: publicProfile(profile), member: publicMember(member) });
  setSessionCookie(res, token);
  return res;
});
