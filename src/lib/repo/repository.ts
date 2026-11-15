import type {
  ActivityEntry,
  Appointment,
  DoseLog,
  Medication,
  Member,
  NotificationRecord,
  Profile,
} from "../domain/types";

/**
 * Storage port. FirestoreRepo implements it for production, MemoryRepo for tests and local demos.
 * Services depend only on this interface (dependency injection).
 */
export interface Repository {
  createProfile(profile: Profile, elder: Member): Promise<void>;
  getProfile(profileId: string): Promise<Profile | null>;
  findProfileByCode(code: string): Promise<Profile | null>;
  listProfiles(): Promise<Profile[]>;
  updateProfile(profileId: string, patch: Partial<Omit<Profile, "id" | "code">>): Promise<void>;
  /** Atomically adds one failed login and locks the profile when the limit is reached. */
  recordFailedLogin(profileId: string, now: Date, maxAttempts: number, lockMs: number): Promise<Profile>;

  listMembers(profileId: string): Promise<Member[]>;
  getMember(profileId: string, memberId: string): Promise<Member | null>;
  saveMember(member: Member): Promise<void>;

  listMedications(profileId: string): Promise<Medication[]>;
  getMedication(profileId: string, medicationId: string): Promise<Medication | null>;
  saveMedication(medication: Medication): Promise<void>;
  deleteMedication(profileId: string, medicationId: string): Promise<void>;

  /** Logs whose local date is between `fromDate` and `toDate` (inclusive). */
  listDoseLogs(profileId: string, fromDate: string, toDate: string): Promise<DoseLog[]>;
  /** Upsert by dose id: writing the same dose twice keeps one log. */
  putDoseLog(profileId: string, log: DoseLog): Promise<void>;
  /** Removes a dose log (Undo). Returns the removed log, or null when there was none. */
  deleteDoseLog(profileId: string, doseId: string): Promise<DoseLog | null>;

  listAppointments(profileId: string): Promise<Appointment[]>;
  getAppointment(profileId: string, appointmentId: string): Promise<Appointment | null>;
  saveAppointment(appointment: Appointment): Promise<void>;
  deleteAppointment(profileId: string, appointmentId: string): Promise<void>;

  /** Creates the notification record. Returns false when the key already exists (already sent). */
  claimNotification(profileId: string, record: NotificationRecord): Promise<boolean>;
  releaseNotification(profileId: string, key: string): Promise<void>;
  /** Notifications sent since the given instant (used for idempotency and the per-recipient daily cap). */
  listNotifications(profileId: string, sinceIso: string): Promise<NotificationRecord[]>;

  addActivity(profileId: string, entry: ActivityEntry): Promise<void>;
  listActivity(profileId: string, limit: number): Promise<ActivityEntry[]>;
}
