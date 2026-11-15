import { NextResponse } from "next/server";
import { medicationSchema } from "@/lib/domain/schemas";
import { createMedication, listMedications } from "@/lib/services/medications";
import { authedRoute, readJson } from "@/lib/server/http";

export const GET = authedRoute(async ({ deps, actor }) =>
  NextResponse.json({ medications: await listMedications(deps, actor) }),
);

export const POST = authedRoute(async ({ req, deps, actor }) => {
  const input = await readJson(req, medicationSchema);
  return NextResponse.json({ medication: await createMedication(deps, actor, input) }, { status: 201 });
});
