import {
  addMemberSchema,
  appointmentSchema,
  createProfileSchema,
  loginSchema,
  medicationDraftListSchema,
  medicationSchema,
  settingsSchema,
} from "./schemas";
import { medInput } from "../../../tests/helpers";

describe("schemas", () => {
  it("createProfile applies defaults and rejects unknown time zones", () => {
    expect(createProfileSchema.parse({ elderName: " Asha " })).toEqual({
      elderName: "Asha",
      timezone: "Asia/Kolkata",
      language: "en",
    });
    expect(createProfileSchema.safeParse({ elderName: "A", timezone: "Mars/Base" }).success).toBe(false);
    expect(createProfileSchema.safeParse({ elderName: "" }).success).toBe(false);
    expect(createProfileSchema.safeParse({ elderName: "x".repeat(81) }).success).toBe(false);
  });

  it("login normalizes case and validates format", () => {
    expect(loginSchema.parse({ code: "care-abcd-efgh", passcode: "abcd2345" })).toEqual({
      code: "CARE-ABCD-EFGH",
      passcode: "ABCD2345",
    });
    expect(loginSchema.safeParse({ code: "CARE-1234", passcode: "ABCD2345" }).success).toBe(false);
    expect(loginSchema.safeParse({ code: "CARE-ABCD-EFGH", passcode: "short" }).success).toBe(false);
  });

  it("medication dedupes and sorts times and days", () => {
    const m = medicationSchema.parse({ ...medInput, times: ["20:00", "08:00", "08:00"], days: [3, 1, 3] });
    expect(m.times).toEqual(["08:00", "20:00"]);
    expect(m.days).toEqual([1, 3]);
  });

  it.each([
    ["no times", { times: [] }],
    ["bad time", { times: ["8am"] }],
    ["hour 24", { times: ["24:00"] }],
    ["end before start", { endDate: "2026-10-01" }],
    ["bad weekday", { days: [7] }],
    ["bad date", { startDate: "15/11/2026" }],
    ["empty name", { name: "  " }],
  ])("medication rejects %s", (_label, patch) => {
    expect(medicationSchema.safeParse({ ...medInput, ...patch }).success).toBe(false);
  });

  it("appointment requires an ISO datetime and normalizes to UTC", () => {
    const a = appointmentSchema.parse({ doctor: "Dr. Rao", purpose: "Eye", at: "2026-11-20T10:30:00+05:30" });
    expect(a.at).toBe("2026-11-20T05:00:00.000Z");
    expect(a.location).toBeNull();
    expect(appointmentSchema.safeParse({ doctor: "Dr", purpose: "x", at: "tomorrow" }).success).toBe(false);
  });

  it("addMember allows only family or caretaker roles", () => {
    const base = { name: "Ravi", role: "family", permission: "view" };
    expect(addMemberSchema.parse(base).notify).toBe(true);
    expect(addMemberSchema.safeParse({ ...base, role: "elder" }).success).toBe(false);
    expect(addMemberSchema.safeParse({ ...base, email: "not-an-email" }).success).toBe(false);
  });

  it("settings enforce ranges", () => {
    const ok = { upcomingLeadMin: 15, missedGraceMin: 30, escalateToCircle: true, escalateAfterMin: 60 };
    expect(settingsSchema.safeParse(ok).success).toBe(true);
    expect(settingsSchema.safeParse({ ...ok, upcomingLeadMin: 1 }).success).toBe(false);
  });

  it("medication drafts from AI are validated", () => {
    expect(medicationDraftListSchema.parse([{ name: "Amlodipine", times: ["09:00"] }])).toEqual([
      { name: "Amlodipine", dosage: "", instructions: "", times: ["09:00"] },
    ]);
    expect(medicationDraftListSchema.safeParse([{ name: "", times: [] }]).success).toBe(false);
    expect(medicationDraftListSchema.safeParse([{ name: "X", times: ["25:00"] }]).success).toBe(false);
  });
});
