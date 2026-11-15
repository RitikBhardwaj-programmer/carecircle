import { adherenceFor, type AdherenceStats } from "../domain/adherence";
import { doseState, dosesForDay, parseDoseId, type DoseState } from "../domain/schedule";
import type { MedicationInput } from "../domain/schemas";
import { addDays, localParts } from "../domain/time";
import type { DoseLog, DoseStatus, DoseVia, Medication } from "../domain/types";
import { AppError } from "../errors";
import { authorize } from "./auth";
import { recordActivity, type Actor, type Deps } from "./deps";

const MAX_MEDICATIONS = 50;

export async function listMedications(deps: Deps, actor: Actor): Promise<Medication[]> {
  authorize(actor, "read");
  const meds = await deps.repo.listMedications(actor.profile.id);
  return meds.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createMedication(deps: Deps, actor: Actor, input: MedicationInput): Promise<Medication> {
  authorize(actor, "write");
  const existing = await deps.repo.listMedications(actor.profile.id);
  if (existing.length >= MAX_MEDICATIONS) throw new AppError("CONFLICT", "Too many medications.");
  const med: Medication = {
    id: deps.newId(),
    profileId: actor.profile.id,
    ...input,
    updatedBy: actor.member.name,
    updatedAt: deps.now().toISOString(),
  };
  await deps.repo.saveMedication(med);
  await recordActivity(deps, actor, "added medication", `${med.name} ${med.dosage}`);
  return med;
}

async function load(deps: Deps, actor: Actor, id: string): Promise<Medication> {
  const med = await deps.repo.getMedication(actor.profile.id, id);
  if (!med) throw new AppError("NOT_FOUND", "Medication not found.");
  return med;
}

export async function updateMedication(
  deps: Deps,
  actor: Actor,
  id: string,
  input: MedicationInput,
): Promise<Medication> {
  authorize(actor, "write");
  const med = await load(deps, actor, id);
  const updated: Medication = {
    ...med,
    ...input,
    updatedBy: actor.member.name,
    updatedAt: deps.now().toISOString(),
  };
  await deps.repo.saveMedication(updated);
  await recordActivity(deps, actor, "edited medication", `${updated.name} ${updated.dosage}`);
  return updated;
}

export async function deleteMedication(deps: Deps, actor: Actor, id: string): Promise<void> {
  authorize(actor, "write");
  const med = await load(deps, actor, id);
  await deps.repo.deleteMedication(actor.profile.id, id);
  await recordActivity(deps, actor, "removed medication", `${med.name} ${med.dosage}`);
}

export interface TodayDose {
  id: string;
  medicationId: string;
  name: string;
  dosage: string;
  instructions: string | null;
  time: string;
  at: string;
  state: DoseState;
  loggedBy: string | null;
}

/** Today's doses (local to the profile time zone) with their status, in time order. */
export async function todayDoses(deps: Deps, actor: Actor): Promise<{ date: string; doses: TodayDose[] }> {
  authorize(actor, "read");
  const now = deps.now();
  const { date } = localParts(now, actor.profile.timezone);
  const [meds, logs] = await Promise.all([
    deps.repo.listMedications(actor.profile.id),
    deps.repo.listDoseLogs(actor.profile.id, date, date),
  ]);
  const byId = new Map(logs.map((l) => [l.id, l]));
  const doses = meds
    .flatMap((med) =>
      dosesForDay(med, date, actor.profile.timezone).map((dose) => {
        const log = byId.get(dose.id);
        return {
          id: dose.id,
          medicationId: med.id,
          name: med.name,
          dosage: med.dosage,
          instructions: med.instructions,
          time: dose.time,
          at: dose.at,
          state: doseState(dose, log, now, actor.profile.settings),
          loggedBy: log?.byName ?? null,
        };
      }),
    )
    .sort((a, b) => a.at.localeCompare(b.at) || a.name.localeCompare(b.name));
  return { date, doses };
}

/**
 * Logs a dose as taken or skipped. The log id equals the dose id,
 * so pressing the button twice keeps a single log (idempotent).
 */
export async function logDose(
  deps: Deps,
  actor: Actor,
  doseIdValue: string,
  status: DoseStatus,
  via: DoseVia = "app",
): Promise<DoseLog> {
  authorize(actor, "write");
  const parts = parseDoseId(doseIdValue);
  if (!parts) throw new AppError("BAD_REQUEST", "Invalid dose.");
  const med = await load(deps, actor, parts.medicationId);
  const dose = dosesForDay(med, parts.date, actor.profile.timezone).find((d) => d.id === doseIdValue);
  if (!dose) throw new AppError("NOT_FOUND", "This dose is not on the schedule.");
  const now = deps.now();
  const today = localParts(now, actor.profile.timezone).date;
  if (parts.date > today || parts.date < addDays(today, -7)) {
    throw new AppError("BAD_REQUEST", "Doses can be logged for the last 7 days only.");
  }
  const log: DoseLog = {
    id: dose.id,
    medicationId: med.id,
    date: dose.date,
    time: dose.time,
    status,
    byMemberId: actor.member.id,
    byName: actor.member.name,
    via,
    at: now.toISOString(),
  };
  await deps.repo.putDoseLog(actor.profile.id, log);
  await recordActivity(deps, actor, `marked dose ${status}${via === "email" ? " (email link)" : ""}`, `${med.name} ${dose.time}`);
  return log;
}

export interface MedicationAdherence {
  medicationId: string;
  name: string;
  dosage: string;
  week: AdherenceStats;
  month: AdherenceStats;
}

/** 7-day and 30-day adherence per medication. */
export async function adherenceSummary(deps: Deps, actor: Actor): Promise<MedicationAdherence[]> {
  authorize(actor, "read");
  const now = deps.now();
  const tz = actor.profile.timezone;
  const today = localParts(now, tz).date;
  const [meds, logs] = await Promise.all([
    deps.repo.listMedications(actor.profile.id),
    deps.repo.listDoseLogs(actor.profile.id, addDays(today, -29), today),
  ]);
  const byId = new Map(logs.map((l) => [l.id, l]));
  const grace = actor.profile.settings.missedGraceMin;
  return meds
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((med) => ({
      medicationId: med.id,
      name: med.name,
      dosage: med.dosage,
      week: adherenceFor(med, byId, today, 7, now, tz, grace),
      month: adherenceFor(med, byId, today, 30, now, tz, grace),
    }));
}
