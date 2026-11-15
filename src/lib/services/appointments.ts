import type { AppointmentInput } from "../domain/schemas";
import type { Appointment } from "../domain/types";
import { AppError } from "../errors";
import { authorize } from "./auth";
import { recordActivity, type Actor, type Deps } from "./deps";

const MAX_APPOINTMENTS = 200;

/** Upcoming appointments (soonest first) and history (most recent first). */
export async function listAppointments(deps: Deps, actor: Actor) {
  authorize(actor, "read");
  const all = await deps.repo.listAppointments(actor.profile.id);
  const nowIso = deps.now().toISOString();
  return {
    upcoming: all.filter((a) => a.at >= nowIso).sort((a, b) => a.at.localeCompare(b.at)),
    past: all.filter((a) => a.at < nowIso).sort((a, b) => b.at.localeCompare(a.at)),
  };
}

export async function createAppointment(deps: Deps, actor: Actor, input: AppointmentInput): Promise<Appointment> {
  authorize(actor, "write");
  const existing = await deps.repo.listAppointments(actor.profile.id);
  if (existing.length >= MAX_APPOINTMENTS) throw new AppError("CONFLICT", "Too many appointments.");
  const appt: Appointment = {
    id: deps.newId(),
    profileId: actor.profile.id,
    ...input,
    updatedBy: actor.member.name,
    updatedAt: deps.now().toISOString(),
  };
  await deps.repo.saveAppointment(appt);
  await recordActivity(deps, actor, "added appointment", `${appt.doctor}: ${appt.purpose}`);
  return appt;
}

async function load(deps: Deps, actor: Actor, id: string): Promise<Appointment> {
  const appt = await deps.repo.getAppointment(actor.profile.id, id);
  if (!appt) throw new AppError("NOT_FOUND", "Appointment not found.");
  return appt;
}

export async function updateAppointment(
  deps: Deps,
  actor: Actor,
  id: string,
  input: AppointmentInput,
): Promise<Appointment> {
  authorize(actor, "write");
  const appt = await load(deps, actor, id);
  const updated = { ...appt, ...input, updatedBy: actor.member.name, updatedAt: deps.now().toISOString() };
  await deps.repo.saveAppointment(updated);
  await recordActivity(deps, actor, "edited appointment", `${updated.doctor}: ${updated.purpose}`);
  return updated;
}

export async function deleteAppointment(deps: Deps, actor: Actor, id: string): Promise<void> {
  authorize(actor, "write");
  const appt = await load(deps, actor, id);
  await deps.repo.deleteAppointment(actor.profile.id, id);
  await recordActivity(deps, actor, "removed appointment", `${appt.doctor}: ${appt.purpose}`);
}

/** Google Calendar "add event" template link (no API key or OAuth needed). */
export function googleCalendarLink(appt: Appointment, elderName: string): string {
  const fmt = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = Date.parse(appt.at);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${elderName}: ${appt.doctor}`,
    dates: `${fmt(start)}/${fmt(start + 60 * 60 * 1000)}`,
    details: [appt.purpose, appt.notes].filter(Boolean).join("\n"),
    location: appt.location ?? "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
