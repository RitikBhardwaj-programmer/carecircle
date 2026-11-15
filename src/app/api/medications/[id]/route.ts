import { NextResponse } from "next/server";
import { idParam, medicationSchema } from "@/lib/domain/schemas";
import { deleteMedication, updateMedication } from "@/lib/services/medications";
import { authedRoute, parseWith, readJson } from "@/lib/server/http";

type Params = { id: string };

export const PUT = authedRoute<Params>(async ({ req, deps, actor, params }) => {
  const id = parseWith(idParam, params.id);
  const input = await readJson(req, medicationSchema);
  return NextResponse.json({ medication: await updateMedication(deps, actor, id, input) });
}, "write");

export const DELETE = authedRoute<Params>(async ({ deps, actor, params }) => {
  await deleteMedication(deps, actor, parseWith(idParam, params.id));
  return NextResponse.json({ ok: true });
}, "write");
