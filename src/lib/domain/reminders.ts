import { createHash } from "node:crypto";
import type { Appointment, Dose, Medication, Member, Profile, ReminderType } from "./types";
import { dosesForDay } from "./schedule";
import { addDays, HOUR_MS, localParts, MINUTE_MS } from "./time";

/** A late cron run may still send a missed-dose alert up to this long after the dose, never older. */
export const LOOK_BACK_MS = 3 * HOUR_MS;

export interface ProfileSnapshot {
  profile: Profile;
  members: Member[];
  medications: Medication[];
  /** Ids of doses that already have a log (taken or skipped). */
  loggedDoseIds: ReadonlySet<string>;
  appointments: Appointment[];
}

export interface Reminder {
  key: string;
  type: ReminderType;
  profileId: string;
  recipient: { memberId: string; name: string; email: string };
  dose?: Dose & { medicationName: string; dosage: string };
  appointment?: Appointment;
}

/** Idempotency key: sha256 of type | dose-or-appointment id | recipient. */
export function notificationKey(type: ReminderType, targetId: string, memberId: string): string {
  return createHash("sha256").update(`${type}|${targetId}|${memberId}`).digest("hex");
}

type Recipient = Reminder["recipient"];

function asRecipient(m: Member): Recipient | null {
  if (m.revokedAt || !m.email) return null;
  return { memberId: m.id, name: m.name, email: m.email };
}

/**
 * Pure planner: decides which reminder emails are due at `now`.
 * It never sends anything; the caller claims each key before sending.
 */
export function planReminders(
  now: Date,
  snap: ProfileSnapshot,
  alreadySent: ReadonlySet<string>,
): Reminder[] {
  const { profile, members } = snap;
  const s = profile.settings;
  const nowMs = now.getTime();
  const tz = profile.timezone;
  const today = localParts(now, tz).date;

  const active = members.filter((m) => !m.revokedAt);
  const elder = active.find((m) => m.role === "elder");
  const elderRecipient = elder ? asRecipient(elder) : null;
  const circle = active
    .filter((m) => m.role !== "elder" && m.notify)
    .map(asRecipient)
    .filter((r): r is Recipient => r !== null);

  const out: Reminder[] = [];
  const push = (type: ReminderType, targetId: string, to: Recipient, extra: Partial<Reminder>): void => {
    const key = notificationKey(type, targetId, to.memberId);
    if (alreadySent.has(key) || out.some((r) => r.key === key)) return;
    out.push({ key, type, profileId: profile.id, recipient: to, ...extra });
  };

  // Doses: look at yesterday, today and tomorrow (local) to cover midnight boundaries.
  const dates = [addDays(today, -1), today, addDays(today, 1)];
  for (const med of snap.medications) {
    for (const date of dates) {
      for (const dose of dosesForDay(med, date, tz)) {
        if (snap.loggedDoseIds.has(dose.id)) continue;
        const at = Date.parse(dose.at);
        const doseInfo = { ...dose, medicationName: med.name, dosage: med.dosage };
        const withinLookBack = nowMs < at + LOOK_BACK_MS;

        if (elderRecipient && nowMs >= at - s.upcomingLeadMin * MINUTE_MS && nowMs < at) {
          push("dose-upcoming", dose.id, elderRecipient, { dose: doseInfo });
        }
        if (elderRecipient && withinLookBack && nowMs >= at + s.missedGraceMin * MINUTE_MS && date === today) {
          push("dose-missed", dose.id, elderRecipient, { dose: doseInfo });
        }
        if (s.escalateToCircle && withinLookBack && nowMs >= at + s.escalateAfterMin * MINUTE_MS) {
          for (const to of circle) push("dose-escalation", dose.id, to, { dose: doseInfo });
        }
      }
    }
  }

  // Appointments: one email 24 h before and one 2 h before, to the elder and the notified circle.
  const apptRecipients = [...(elderRecipient ? [elderRecipient] : []), ...circle];
  for (const appt of snap.appointments) {
    const at = Date.parse(appt.at);
    if (nowMs >= at) continue;
    const type: ReminderType | null =
      nowMs >= at - 2 * HOUR_MS ? "appt-2h" : nowMs >= at - 24 * HOUR_MS ? "appt-24h" : null;
    if (!type) continue;
    for (const to of apptRecipients) push(type, appt.id, to, { appointment: appt });
  }
  return out;
}
