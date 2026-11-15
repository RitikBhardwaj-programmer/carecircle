import { NextResponse } from "next/server";
import { can } from "@/lib/domain/permissions";
import { publicMember, publicProfile } from "@/lib/services/auth";
import { authedRoute } from "@/lib/server/http";

export const GET = authedRoute(async ({ actor }) =>
  NextResponse.json({
    profile: publicProfile(actor.profile),
    member: publicMember(actor.member),
    can: { write: can(actor.member, "write"), manageCircle: can(actor.member, "manageCircle") },
  }),
);
