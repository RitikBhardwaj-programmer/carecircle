import { z } from "zod";
import { isValidTimeZone } from "./time";

/** Input validation for every request body. Every string has a length limit. */

const trimmed = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm (24 h)");
export const localDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), "Invalid date");
export const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const idParam = z.string().regex(/^[A-Za-z0-9-]{1,64}$/, "Invalid id");

export const languageSchema = z.enum(["en", "hi"]);

export const createProfileSchema = z.object({
  elderName: trimmed(80),
  email: email.optional().nullable(),
  timezone: z
    .string()
    .max(64)
    .default("Asia/Kolkata")
    .refine(isValidTimeZone, "Unknown time zone"),
  language: languageSchema.default("en"),
});

export const profileCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^CARE-[A-Z2-9]{4}-[A-Z2-9]{4}$/, "Profile code looks like CARE-XXXX-XXXX");

export const passcodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z2-9]{8}$/, "Passcode has 8 letters or digits");

export const loginSchema = z.object({ code: profileCodeSchema, passcode: passcodeSchema });

export const addMemberSchema = z.object({
  name: trimmed(80),
  email: email.optional().nullable(),
  role: z.enum(["family", "caretaker"]),
  permission: z.enum(["view", "manage"]),
  notify: z.boolean().default(true),
});

export const updateMemberSchema = z
  .object({
    permission: z.enum(["view", "manage"]).optional(),
    notify: z.boolean().optional(),
    email: email.optional().nullable(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const settingsSchema = z.object({
  upcomingLeadMin: z.number().int().min(5).max(120),
  missedGraceMin: z.number().int().min(10).max(180),
  escalateToCircle: z.boolean(),
  escalateAfterMin: z.number().int().min(15).max(180),
  language: languageSchema.optional(),
});

export const medicationSchema = z
  .object({
    name: trimmed(80),
    dosage: trimmed(60),
    instructions: optionalText(300),
    times: z
      .array(timeOfDay)
      .min(1, "Add at least one time")
      .max(8)
      .transform((t) => [...new Set(t)].sort()),
    days: z
      .array(z.number().int().min(0).max(6))
      .max(7)
      .default([])
      .transform((d) => [...new Set(d)].sort()),
    startDate: localDate,
    endDate: localDate.optional().nullable().transform((v) => v ?? null),
    active: z.boolean().default(true),
  })
  .refine((m) => !m.endDate || m.endDate >= m.startDate, {
    message: "End date must be on or after start date",
    path: ["endDate"],
  });

export const doseLogSchema = z.object({
  doseId: z.string().max(100),
  status: z.enum(["taken", "skipped"]),
});

export const appointmentSchema = z.object({
  doctor: trimmed(80),
  purpose: trimmed(120),
  location: optionalText(160),
  at: z.iso.datetime({ offset: true }).transform((v) => new Date(v).toISOString()),
  notes: optionalText(500),
});

export const explainSchema = z.object({
  name: trimmed(80),
  dosage: optionalText(60),
  language: languageSchema.default("en"),
});

/** What Gemini must return for a prescription scan; validated again before it reaches the UI. */
export const medicationDraftSchema = z.object({
  name: trimmed(80),
  dosage: z.string().trim().max(60).default(""),
  instructions: z.string().trim().max(300).default(""),
  times: z.array(timeOfDay).max(8).default([]),
});
export const medicationDraftListSchema = z.array(medicationDraftSchema).max(10);

export type CreateProfileInput = z.infer<typeof createProfileSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;
export type MedicationInput = z.infer<typeof medicationSchema>;
export type AppointmentInput = z.infer<typeof appointmentSchema>;
export type MedicationDraft = z.infer<typeof medicationDraftSchema>;
