import type {
  ActivityEntry,
  Appointment,
  DoseLog,
  Medication,
  Member,
  NotificationRecord,
  Profile,
} from "../domain/types";
import type { Repository } from "./repository";

interface ProfileData {
  profile: Profile;
  members: Map<string, Member>;
  medications: Map<string, Medication>;
  doseLogs: Map<string, DoseLog>;
  appointments: Map<string, Appointment>;
  notifications: Map<string, NotificationRecord>;
  activity: ActivityEntry[];
}

const clone = <T>(v: T): T => structuredClone(v);

/** In-memory repository for tests and local demos. Returns copies so callers cannot mutate state. */
export class MemoryRepo implements Repository {
  private readonly data = new Map<string, ProfileData>();

  private bucket(profileId: string): ProfileData {
    const b = this.data.get(profileId);
    if (!b) throw new Error(`Unknown profile ${profileId}`);
    return b;
  }

  async createProfile(profile: Profile, elder: Member): Promise<void> {
    this.data.set(profile.id, {
      profile: clone(profile),
      members: new Map([[elder.id, clone(elder)]]),
      medications: new Map(),
      doseLogs: new Map(),
      appointments: new Map(),
      notifications: new Map(),
      activity: [],
    });
  }

  async getProfile(profileId: string): Promise<Profile | null> {
    const b = this.data.get(profileId);
    return b ? clone(b.profile) : null;
  }

  async findProfileByCode(code: string): Promise<Profile | null> {
    for (const b of this.data.values()) if (b.profile.code === code) return clone(b.profile);
    return null;
  }

  async listProfiles(): Promise<Profile[]> {
    return [...this.data.values()].map((b) => clone(b.profile));
  }

  async updateProfile(profileId: string, patch: Partial<Profile>): Promise<void> {
    const b = this.bucket(profileId);
    b.profile = { ...b.profile, ...clone(patch) };
  }

  async recordFailedLogin(profileId: string, now: Date, maxAttempts: number, lockMs: number): Promise<Profile> {
    const b = this.bucket(profileId);
    const failed = b.profile.failedLogins + 1;
    b.profile =
      failed >= maxAttempts
        ? { ...b.profile, failedLogins: 0, lockedUntil: new Date(now.getTime() + lockMs).toISOString() }
        : { ...b.profile, failedLogins: failed };
    return clone(b.profile);
  }

  async listMembers(profileId: string): Promise<Member[]> {
    return [...this.bucket(profileId).members.values()].map(clone);
  }

  async getMember(profileId: string, memberId: string): Promise<Member | null> {
    const m = this.data.get(profileId)?.members.get(memberId);
    return m ? clone(m) : null;
  }

  async saveMember(member: Member): Promise<void> {
    this.bucket(member.profileId).members.set(member.id, clone(member));
  }

  async listMedications(profileId: string): Promise<Medication[]> {
    return [...this.bucket(profileId).medications.values()].map(clone);
  }

  async getMedication(profileId: string, medicationId: string): Promise<Medication | null> {
    const m = this.data.get(profileId)?.medications.get(medicationId);
    return m ? clone(m) : null;
  }

  async saveMedication(medication: Medication): Promise<void> {
    this.bucket(medication.profileId).medications.set(medication.id, clone(medication));
  }

  async deleteMedication(profileId: string, medicationId: string): Promise<void> {
    this.bucket(profileId).medications.delete(medicationId);
  }

  async listDoseLogs(profileId: string, fromDate: string, toDate: string): Promise<DoseLog[]> {
    return [...this.bucket(profileId).doseLogs.values()]
      .filter((l) => l.date >= fromDate && l.date <= toDate)
      .map(clone);
  }

  async putDoseLog(profileId: string, log: DoseLog): Promise<void> {
    this.bucket(profileId).doseLogs.set(log.id, clone(log));
  }

  async listAppointments(profileId: string): Promise<Appointment[]> {
    return [...this.bucket(profileId).appointments.values()].map(clone);
  }

  async getAppointment(profileId: string, appointmentId: string): Promise<Appointment | null> {
    const a = this.data.get(profileId)?.appointments.get(appointmentId);
    return a ? clone(a) : null;
  }

  async saveAppointment(appointment: Appointment): Promise<void> {
    this.bucket(appointment.profileId).appointments.set(appointment.id, clone(appointment));
  }

  async deleteAppointment(profileId: string, appointmentId: string): Promise<void> {
    this.bucket(profileId).appointments.delete(appointmentId);
  }

  async claimNotification(profileId: string, record: NotificationRecord): Promise<boolean> {
    const n = this.bucket(profileId).notifications;
    if (n.has(record.key)) return false;
    n.set(record.key, clone(record));
    return true;
  }

  async releaseNotification(profileId: string, key: string): Promise<void> {
    this.bucket(profileId).notifications.delete(key);
  }

  async listNotificationKeys(profileId: string, sinceIso: string): Promise<Set<string>> {
    const keys = [...this.bucket(profileId).notifications.values()]
      .filter((n) => n.sentAt >= sinceIso)
      .map((n) => n.key);
    return new Set(keys);
  }

  async addActivity(profileId: string, entry: ActivityEntry): Promise<void> {
    this.bucket(profileId).activity.push(clone(entry));
  }

  async listActivity(profileId: string, limit: number): Promise<ActivityEntry[]> {
    return [...this.bucket(profileId).activity]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, limit)
      .map(clone);
  }
}
