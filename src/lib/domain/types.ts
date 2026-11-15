/** Core domain types shared by every layer. All instants are ISO-8601 UTC strings. */

export type Role = "elder" | "family" | "caretaker";
export type Permission = "view" | "manage";
export type Language = "en" | "hi";
export type DoseStatus = "taken" | "skipped";
export type DoseVia = "app" | "email";

export interface ProfileSettings {
  /** Minutes before a dose when the "upcoming" email goes out. */
  upcomingLeadMin: number;
  /** Minutes after a dose when the elder gets a "missed" email. */
  missedGraceMin: number;
  /** The elder decides whether the circle is told about missed doses. */
  escalateToCircle: boolean;
  /** Minutes after a dose when the circle gets the escalation email. */
  escalateAfterMin: number;
}

export interface Profile {
  id: string;
  /** Public login id, e.g. "CARE-7K2M-9QXD". */
  code: string;
  elderName: string;
  /** IANA time zone, e.g. "Asia/Kolkata". */
  timezone: string;
  language: Language;
  settings: ProfileSettings;
  failedLogins: number;
  lockedUntil: string | null;
  createdAt: string;
}

export interface Member {
  id: string;
  profileId: string;
  name: string;
  email: string | null;
  role: Role;
  permission: Permission;
  passcodeHash: string;
  salt: string;
  revokedAt: string | null;
  notify: boolean;
  createdAt: string;
}

export interface Medication {
  id: string;
  profileId: string;
  name: string;
  dosage: string;
  instructions: string | null;
  /** Local times "HH:mm", sorted. */
  times: string[];
  /** Weekdays 0 (Sunday) to 6. Empty means every day. */
  days: number[];
  /** Local dates "YYYY-MM-DD". */
  startDate: string;
  endDate: string | null;
  active: boolean;
  updatedBy: string;
  updatedAt: string;
}

/** A dose is computed, never stored. Its id is deterministic: `${medicationId}_${date}_${HHmm}`. */
export interface Dose {
  id: string;
  medicationId: string;
  date: string;
  time: string;
  /** UTC instant of the dose. */
  at: string;
}

export interface DoseLog {
  /** Same as the dose id, so logging twice overwrites (idempotent). */
  id: string;
  medicationId: string;
  date: string;
  time: string;
  status: DoseStatus;
  byMemberId: string;
  byName: string;
  via: DoseVia;
  at: string;
}

export interface Appointment {
  id: string;
  profileId: string;
  doctor: string;
  purpose: string;
  location: string | null;
  /** UTC instant. */
  at: string;
  notes: string | null;
  updatedBy: string;
  updatedAt: string;
}

export type ReminderType = "dose-upcoming" | "dose-missed" | "dose-escalation" | "appt-24h" | "appt-2h";

export interface NotificationRecord {
  key: string;
  type: ReminderType;
  recipientMemberId: string;
  sentAt: string;
}

export interface ActivityEntry {
  id: string;
  actorName: string;
  action: string;
  target: string;
  at: string;
}

export const DEFAULT_SETTINGS: ProfileSettings = {
  upcomingLeadMin: 15,
  missedGraceMin: 30,
  escalateToCircle: true,
  escalateAfterMin: 60,
};
