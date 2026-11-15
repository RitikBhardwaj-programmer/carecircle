import { Firestore, type DocumentData } from "@google-cloud/firestore";
import type {
  ActivityEntry,
  Appointment,
  DoseLog,
  Medication,
  Member,
  NotificationRecord,
  Profile,
} from "../domain/types";
import type { Repository } from "../repo/repository";

/** gRPC status code Firestore uses when `create()` hits an existing document. */
const ALREADY_EXISTS = 6;

/**
 * Firestore implementation of the Repository port.
 * Layout: profiles/{id} with sub-collections members, medications, doseLogs, appointments,
 * notifications and activity. Authenticates with Application Default Credentials (no key file).
 */
export class FirestoreRepo implements Repository {
  constructor(private readonly db: Firestore = new Firestore({ ignoreUndefinedProperties: true })) {}

  private profile(id: string) {
    return this.db.collection("profiles").doc(id);
  }
  private sub(profileId: string, name: string) {
    return this.profile(profileId).collection(name);
  }
  private static withId<T>(id: string, data: DocumentData | undefined): T | null {
    return data ? ({ ...data, id } as T) : null;
  }

  async createProfile(profile: Profile, elder: Member): Promise<void> {
    const batch = this.db.batch();
    const { id, ...data } = profile;
    batch.create(this.profile(id), data);
    batch.create(this.sub(id, "members").doc(elder.id), elder);
    await batch.commit();
  }

  async getProfile(profileId: string): Promise<Profile | null> {
    const snap = await this.profile(profileId).get();
    return FirestoreRepo.withId<Profile>(snap.id, snap.data());
  }

  async findProfileByCode(code: string): Promise<Profile | null> {
    const q = await this.db.collection("profiles").where("code", "==", code).limit(1).get();
    const doc = q.docs[0];
    return doc ? FirestoreRepo.withId<Profile>(doc.id, doc.data()) : null;
  }

  async listProfiles(): Promise<Profile[]> {
    const q = await this.db.collection("profiles").get();
    return q.docs.map((d) => ({ ...d.data(), id: d.id }) as Profile);
  }

  async updateProfile(profileId: string, patch: Partial<Profile>): Promise<void> {
    await this.profile(profileId).update(patch);
  }

  async recordFailedLogin(profileId: string, now: Date, maxAttempts: number, lockMs: number): Promise<Profile> {
    const ref = this.profile(profileId);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = FirestoreRepo.withId<Profile>(snap.id, snap.data());
      if (!current) throw new Error("Profile disappeared");
      const failed = current.failedLogins + 1;
      const patch =
        failed >= maxAttempts
          ? { failedLogins: 0, lockedUntil: new Date(now.getTime() + lockMs).toISOString() }
          : { failedLogins: failed };
      tx.update(ref, patch);
      return { ...current, ...patch };
    });
  }

  async listMembers(profileId: string): Promise<Member[]> {
    const q = await this.sub(profileId, "members").get();
    return q.docs.map((d) => d.data() as Member);
  }

  async getMember(profileId: string, memberId: string): Promise<Member | null> {
    const snap = await this.sub(profileId, "members").doc(memberId).get();
    return (snap.data() as Member | undefined) ?? null;
  }

  async saveMember(member: Member): Promise<void> {
    await this.sub(member.profileId, "members").doc(member.id).set(member);
  }

  async listMedications(profileId: string): Promise<Medication[]> {
    const q = await this.sub(profileId, "medications").get();
    return q.docs.map((d) => d.data() as Medication);
  }

  async getMedication(profileId: string, medicationId: string): Promise<Medication | null> {
    const snap = await this.sub(profileId, "medications").doc(medicationId).get();
    return (snap.data() as Medication | undefined) ?? null;
  }

  async saveMedication(medication: Medication): Promise<void> {
    await this.sub(medication.profileId, "medications").doc(medication.id).set(medication);
  }

  async deleteMedication(profileId: string, medicationId: string): Promise<void> {
    await this.sub(profileId, "medications").doc(medicationId).delete();
  }

  async listDoseLogs(profileId: string, fromDate: string, toDate: string): Promise<DoseLog[]> {
    const q = await this.sub(profileId, "doseLogs").where("date", ">=", fromDate).where("date", "<=", toDate).get();
    return q.docs.map((d) => d.data() as DoseLog);
  }

  async putDoseLog(profileId: string, log: DoseLog): Promise<void> {
    await this.sub(profileId, "doseLogs").doc(log.id).set(log);
  }

  async listAppointments(profileId: string): Promise<Appointment[]> {
    const q = await this.sub(profileId, "appointments").get();
    return q.docs.map((d) => d.data() as Appointment);
  }

  async getAppointment(profileId: string, appointmentId: string): Promise<Appointment | null> {
    const snap = await this.sub(profileId, "appointments").doc(appointmentId).get();
    return (snap.data() as Appointment | undefined) ?? null;
  }

  async saveAppointment(appointment: Appointment): Promise<void> {
    await this.sub(appointment.profileId, "appointments").doc(appointment.id).set(appointment);
  }

  async deleteAppointment(profileId: string, appointmentId: string): Promise<void> {
    await this.sub(profileId, "appointments").doc(appointmentId).delete();
  }

  async claimNotification(profileId: string, record: NotificationRecord): Promise<boolean> {
    try {
      await this.sub(profileId, "notifications").doc(record.key).create(record);
      return true;
    } catch (err) {
      if ((err as { code?: number }).code === ALREADY_EXISTS) return false;
      throw err;
    }
  }

  async releaseNotification(profileId: string, key: string): Promise<void> {
    await this.sub(profileId, "notifications").doc(key).delete();
  }

  async listNotifications(profileId: string, sinceIso: string): Promise<NotificationRecord[]> {
    const q = await this.sub(profileId, "notifications").where("sentAt", ">=", sinceIso).get();
    return q.docs.map((d) => d.data() as NotificationRecord);
  }

  async addActivity(profileId: string, entry: ActivityEntry): Promise<void> {
    await this.sub(profileId, "activity").doc(entry.id).create(entry);
  }

  async listActivity(profileId: string, limit: number): Promise<ActivityEntry[]> {
    const q = await this.sub(profileId, "activity").orderBy("at", "desc").limit(limit).get();
    return q.docs.map((d) => d.data() as ActivityEntry);
  }
}
