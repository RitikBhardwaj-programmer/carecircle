import { can } from "../domain/permissions";
import { planReminders, type Reminder } from "../domain/reminders";
import { addDays, DAY_MS, localParts } from "../domain/time";
import type { Profile } from "../domain/types";
import { renderReminder } from "../email/templates";
import { AppError } from "../errors";
import { logger } from "../infra/logger";
import { createDoseLinkToken, verifyDoseLinkToken } from "../security/tokens";
import type { Deps } from "./deps";
import { logDose } from "./medications";

export interface CronResult {
  profiles: number;
  planned: number;
  sent: number;
  skipped: number;
  failed: number;
}

async function snapshotFor(deps: Deps, profile: Profile) {
  const today = localParts(deps.now(), profile.timezone).date;
  const [members, medications, logs, appointments] = await Promise.all([
    deps.repo.listMembers(profile.id),
    deps.repo.listMedications(profile.id),
    deps.repo.listDoseLogs(profile.id, addDays(today, -1), addDays(today, 1)),
    deps.repo.listAppointments(profile.id),
  ]);
  return { profile, members, medications, appointments, loggedDoseIds: new Set(logs.map((l) => l.id)) };
}

/**
 * One cron run. For each planned reminder: claim the notification key first (create fails if it
 * exists), then send; if sending fails, release the key so the next run retries.
 * Running it twice in a row sends nothing new.
 */
export async function runReminders(deps: Deps): Promise<CronResult> {
  const result: CronResult = { profiles: 0, planned: 0, sent: 0, skipped: 0, failed: 0 };
  const now = deps.now();
  const profiles = await deps.repo.listProfiles();
  for (const profile of profiles) {
    result.profiles += 1;
    try {
      const snap = await snapshotFor(deps, profile);
      const sentKeys = await deps.repo.listNotificationKeys(profile.id, new Date(now.getTime() - 3 * DAY_MS).toISOString());
      const reminders = planReminders(now, snap, sentKeys);
      result.planned += reminders.length;
      for (const r of reminders) {
        const claimed = await deps.repo.claimNotification(profile.id, {
          key: r.key,
          type: r.type,
          recipientMemberId: r.recipient.memberId,
          sentAt: now.toISOString(),
        });
        if (!claimed) {
          result.skipped += 1;
          continue;
        }
        try {
          const member = snap.members.find((m) => m.id === r.recipient.memberId);
          await deps.mailer.send(
            renderReminder(r, {
              elderName: profile.elderName,
              timeZone: profile.timezone,
              appUrl: deps.appUrl,
              doseLink: member && can(member, "write") ? doseLinkFor(deps, r) : undefined,
            }),
          );
          result.sent += 1;
        } catch (err) {
          await deps.repo.releaseNotification(profile.id, r.key);
          result.failed += 1;
          logger.error("reminder.send_failed", { type: r.type, error: (err as Error).name });
        }
      }
    } catch (err) {
      result.failed += 1;
      logger.error("reminder.profile_failed", { profileId: profile.id, error: (err as Error).name });
    }
  }
  return result;
}

function doseLinkFor(deps: Deps, r: Reminder): string | undefined {
  if (!r.dose) return undefined;
  const token = createDoseLinkToken(
    { profileId: r.profileId, doseId: r.dose.id, memberId: r.recipient.memberId },
    deps.now(),
    deps.secret,
  );
  return `${deps.appUrl}/dose/${token}`;
}

/** Details shown on the one-tap confirm page (GET). Does not change anything. */
export async function describeDoseLink(deps: Deps, token: string) {
  const claims = verifyDoseLinkToken(token, deps.now(), deps.secret);
  if (!claims) throw new AppError("UNAUTHORIZED", "This link has expired or is not valid.");
  const [profile, member] = await Promise.all([
    deps.repo.getProfile(claims.profileId),
    deps.repo.getMember(claims.profileId, claims.memberId),
  ]);
  if (!profile || !member || member.revokedAt) {
    throw new AppError("UNAUTHORIZED", "This link has expired or is not valid.");
  }
  const medId = claims.doseId.split("_")[0] ?? "";
  const med = await deps.repo.getMedication(profile.id, medId);
  if (!med) throw new AppError("NOT_FOUND", "This medication was removed.");
  const time = claims.doseId.slice(-4);
  return {
    profile,
    member,
    doseId: claims.doseId,
    elderName: profile.elderName,
    medication: `${med.name} (${med.dosage})`,
    time: `${time.slice(0, 2)}:${time.slice(2)}`,
  };
}

/** Marks the dose from the email link as taken (POST only, so link scanners cannot do it). */
export async function confirmDoseLink(deps: Deps, token: string) {
  const info = await describeDoseLink(deps, token);
  const log = await logDose(deps, { profile: info.profile, member: info.member }, info.doseId, "taken", "email");
  return { medication: info.medication, time: info.time, status: log.status };
}
