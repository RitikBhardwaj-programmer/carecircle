import { can } from "../domain/permissions";
import { planReminders, type Reminder } from "../domain/reminders";
import { parseDoseId } from "../domain/schedule";
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

/** Profiles handled at the same time in one cron run (bounded, so Firestore and SMTP are not flooded). */
export const PROFILE_CONCURRENCY = 5;
/** Abuse guard: one recipient gets at most this many reminder emails in 24 hours. */
export const MAX_EMAILS_PER_RECIPIENT_PER_DAY = 30;

/**
 * One cron run. Profiles are processed in small parallel batches. For each planned reminder:
 * claim the notification key first (create fails if it exists), then send; if sending fails,
 * release the key so the next run retries. Running it twice in a row sends nothing new.
 */
export async function runReminders(deps: Deps): Promise<CronResult> {
  const result: CronResult = { profiles: 0, planned: 0, sent: 0, skipped: 0, failed: 0 };
  const profiles = await deps.repo.listProfiles();
  for (let i = 0; i < profiles.length; i += PROFILE_CONCURRENCY) {
    const batch = profiles.slice(i, i + PROFILE_CONCURRENCY);
    const partials = await Promise.all(batch.map((p) => runForProfile(deps, p)));
    for (const part of partials) {
      result.profiles += 1;
      result.planned += part.planned;
      result.sent += part.sent;
      result.skipped += part.skipped;
      result.failed += part.failed;
    }
  }
  return result;
}

async function runForProfile(deps: Deps, profile: Profile): Promise<Omit<CronResult, "profiles">> {
  const part = { planned: 0, sent: 0, skipped: 0, failed: 0 };
  const now = deps.now();
  try {
    const [snap, history] = await Promise.all([
      snapshotFor(deps, profile),
      deps.repo.listNotifications(profile.id, new Date(now.getTime() - 3 * DAY_MS).toISOString()),
    ]);
    const dayAgo = new Date(now.getTime() - DAY_MS).toISOString();
    const sentToday = new Map<string, number>();
    for (const n of history) {
      if (n.sentAt >= dayAgo) sentToday.set(n.recipientMemberId, (sentToday.get(n.recipientMemberId) ?? 0) + 1);
    }
    const reminders = planReminders(now, snap, new Set(history.map((n) => n.key)));
    part.planned = reminders.length;
    for (const r of reminders) {
      const count = sentToday.get(r.recipient.memberId) ?? 0;
      if (count >= MAX_EMAILS_PER_RECIPIENT_PER_DAY) {
        part.skipped += 1;
        continue;
      }
      const claimed = await deps.repo.claimNotification(profile.id, {
        key: r.key,
        type: r.type,
        recipientMemberId: r.recipient.memberId,
        sentAt: now.toISOString(),
      });
      if (!claimed) {
        part.skipped += 1;
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
        sentToday.set(r.recipient.memberId, count + 1);
        part.sent += 1;
      } catch (err) {
        await deps.repo.releaseNotification(profile.id, r.key);
        part.failed += 1;
        logger.error("reminder.send_failed", { type: r.type, error: (err as Error).name });
      }
    }
  } catch (err) {
    part.failed += 1;
    logger.error("reminder.profile_failed", { profileId: profile.id, error: (err as Error).name });
  }
  return part;
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
  const parts = parseDoseId(claims.doseId);
  if (!parts) throw new AppError("UNAUTHORIZED", "This link has expired or is not valid.");
  const med = await deps.repo.getMedication(profile.id, parts.medicationId);
  if (!med) throw new AppError("NOT_FOUND", "This medication was removed.");
  return {
    profile,
    member,
    doseId: claims.doseId,
    elderName: profile.elderName,
    medication: `${med.name} (${med.dosage})`,
    time: parts.time,
  };
}

/** Marks the dose from the email link as taken (POST only, so link scanners cannot do it). */
export async function confirmDoseLink(deps: Deps, token: string) {
  const info = await describeDoseLink(deps, token);
  const log = await logDose(deps, { profile: info.profile, member: info.member }, info.doseId, "taken", "email");
  return { medication: info.medication, time: info.time, status: log.status };
}
