import { NextResponse } from "next/server";
import { appointmentSchema } from "@/lib/domain/schemas";
import { createAppointment, googleCalendarLink, listAppointments } from "@/lib/services/appointments";
import { authedRoute, readJson } from "@/lib/server/http";

export const GET = authedRoute(async ({ deps, actor }) => {
  const { upcoming, past } = await listAppointments(deps, actor);
  const withLink = <T extends Parameters<typeof googleCalendarLink>[0]>(a: T) => ({
    ...a,
    calendarUrl: googleCalendarLink(a, actor.profile.elderName),
  });
  return NextResponse.json({ upcoming: upcoming.map(withLink), past: past.map(withLink) });
});

export const POST = authedRoute(async ({ req, deps, actor }) => {
  const input = await readJson(req, appointmentSchema);
  return NextResponse.json({ appointment: await createAppointment(deps, actor, input) }, { status: 201 });
});
