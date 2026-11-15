import { NextResponse } from "next/server";
import { clearSessionCookie, publicRoute } from "@/lib/server/http";

export const POST = publicRoute(async () => {
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
});
