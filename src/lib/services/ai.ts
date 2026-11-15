import { medicationDraftListSchema, type MedicationDraft } from "../domain/schemas";
import type { Language } from "../domain/types";
import { AppError } from "../errors";
import { logger } from "../infra/logger";
import type { TextModel } from "../infra/gemini";
import { authorize } from "./auth";
import type { Actor } from "./deps";

export const DISCLAIMER: Record<Language, string> = {
  en: "This is not medical advice. Ask your doctor or pharmacist.",
  hi: "यह चिकित्सा सलाह नहीं है। अपने डॉक्टर या फार्मासिस्ट से पूछें।",
};

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const TIMEOUT_MS = 20_000;

const SCAN_SYSTEM = [
  "You read photos of medical prescriptions for a medication reminder app.",
  "Extract only medicines that are clearly written. Never invent a medicine, dose or time.",
  "For each medicine give: name, dosage (e.g. '500 mg' or '1 tablet'), short instructions, and times as 24-hour HH:mm.",
  "Map common patterns: once daily = 08:00; twice daily or 1-0-1 = 08:00 and 20:00; thrice daily or 1-1-1 = 08:00, 14:00, 20:00; at night = 21:00.",
  "If the image is not a prescription or is unreadable, return an empty list.",
].join(" ");

const SCAN_SCHEMA = {
  type: "object",
  properties: {
    medications: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          dosage: { type: "string" },
          instructions: { type: "string" },
          times: { type: "array", items: { type: "string", pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$" } },
        },
        required: ["name", "dosage", "instructions", "times"],
      },
    },
  },
  required: ["medications"],
};

/**
 * Prescription photo → draft medication list. The draft is only returned to the UI;
 * nothing is saved until a person reviews it and presses Confirm.
 */
export async function scanPrescription(
  model: TextModel,
  actor: Actor,
  image: { mimeType: string; bytes: Buffer },
): Promise<MedicationDraft[]> {
  authorize(actor, "write");
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(image.mimeType)) {
    throw new AppError("BAD_REQUEST", "Use a JPEG, PNG or WebP photo.");
  }
  if (image.bytes.length === 0 || image.bytes.length > MAX_IMAGE_BYTES) {
    throw new AppError("BAD_REQUEST", "The photo must be smaller than 4 MB.");
  }
  let raw: string;
  try {
    raw = await model.generate({
      system: SCAN_SYSTEM,
      prompt: "List the medicines on this prescription.",
      image: { mimeType: image.mimeType, base64: image.bytes.toString("base64") },
      jsonSchema: SCAN_SCHEMA,
      timeoutMs: TIMEOUT_MS,
    });
  } catch (err) {
    logger.warn("ai.scan_failed", { error: (err as Error).name });
    throw new AppError("UPSTREAM", "We could not read the photo. Please enter the medicine by hand.");
  }
  try {
    const parsed = JSON.parse(raw) as { medications?: unknown };
    const result = medicationDraftListSchema.safeParse(parsed.medications ?? []);
    if (!result.success) throw new Error("schema");
    return result.data;
  } catch {
    throw new AppError("UPSTREAM", "We could not read the photo. Please enter the medicine by hand.");
  }
}

const EXPLAIN_SYSTEM = (lang: Language) =>
  [
    "You explain medicines to elderly people and their families in very plain, short sentences.",
    `Answer in ${lang === "hi" ? "simple Hindi (Devanagari script)" : "simple English"}.`,
    "Write exactly three short sections with these headings: 'What it is for', 'How to take it', 'Questions for your doctor'" +
      (lang === "hi" ? " (translate the headings to Hindi)." : "."),
    "Each section has at most 3 bullet points.",
    "Never diagnose. Never suggest changing, stopping or starting a dose. Do not mention brand prices.",
    `Always end with this exact line: "${DISCLAIMER[lang]}"`,
  ].join(" ");

const cache = new Map<string, string>();
const MAX_CACHE = 500;

/** Plain-language medicine explainer, cached per (name, dosage, language). */
export async function explainMedicine(
  model: TextModel,
  actor: Actor,
  input: { name: string; dosage: string | null; language: Language },
): Promise<{ text: string; disclaimer: string; cached: boolean }> {
  authorize(actor, "read");
  const key = `${input.language}|${input.name.toLowerCase()}|${(input.dosage ?? "").toLowerCase()}`;
  const hit = cache.get(key);
  if (hit) return { text: hit, disclaimer: DISCLAIMER[input.language], cached: true };
  let text: string;
  try {
    text = await model.generate({
      system: EXPLAIN_SYSTEM(input.language),
      prompt: `Medicine: ${input.name}${input.dosage ? `, ${input.dosage}` : ""}`,
      timeoutMs: TIMEOUT_MS,
    });
  } catch (err) {
    logger.warn("ai.explain_failed", { error: (err as Error).name });
    throw new AppError("UPSTREAM", "The explainer is not available right now. Please try again later.");
  }
  text = text.trim().slice(0, 4000);
  if (!text) throw new AppError("UPSTREAM", "The explainer is not available right now. Please try again later.");
  // Guarantee the disclaimer even if the model forgot it.
  if (!text.includes(DISCLAIMER[input.language])) text = `${text}\n\n${DISCLAIMER[input.language]}`;
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value ?? "");
  cache.set(key, text);
  return { text, disclaimer: DISCLAIMER[input.language], cached: false };
}
