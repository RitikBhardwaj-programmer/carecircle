import { NextResponse } from "next/server";
import { appointmentSchema, idParam } from "@/lib/domain/schemas";
import { deleteAppointment, updateAppointment } from "@/lib/services/appointments";
import { authedRoute, parseWith, readJson } from "@/lib/server/http";

type Params = { id: string };

export const PUT = authedRoute<Params>(async ({ req, deps, actor, params }) => {
  const id = parseWith(idParam, params.id);
  const input = await readJson(req, appointmentSchema);
  return NextResponse.json({ appointment: await updateAppointment(deps, actor, id, input) });
}, "write");

export const DELETE = authedRoute<Params>(async ({ deps, actor, params }) => {
  await deleteAppointment(deps, actor, parseWith(idParam, params.id));
  return NextResponse.json({ ok: true });
}, "write");
