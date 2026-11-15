import { GoogleGenAI } from "@google/genai";

/** Minimal port so the AI service can be tested with a fake model. */
export interface TextModel {
  generate(req: {
    system: string;
    prompt: string;
    image?: { mimeType: string; base64: string };
    jsonSchema?: unknown;
    timeoutMs: number;
  }): Promise<string>;
}

/**
 * Gemini through @google/genai.
 * Primary: Vertex AI with Application Default Credentials (the Cloud Run service account, no key).
 * Fallback: GEMINI_API_KEY for the Gemini Developer API.
 */
export class GeminiModel implements TextModel {
  private readonly ai: GoogleGenAI;

  constructor(
    private readonly model: string,
    env: Readonly<Record<string, string | undefined>> = process.env,
  ) {
    const apiKey = env.GEMINI_API_KEY?.trim();
    this.ai = apiKey
      ? new GoogleGenAI({ apiKey })
      : new GoogleGenAI({
          vertexai: true,
          project: env.GOOGLE_CLOUD_PROJECT,
          location: env.GOOGLE_CLOUD_LOCATION || "global",
        });
  }

  async generate(req: Parameters<TextModel["generate"]>[0]): Promise<string> {
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
    if (req.image) parts.push({ inlineData: { mimeType: req.image.mimeType, data: req.image.base64 } });
    parts.push({ text: req.prompt });
    const res = await this.ai.models.generateContent({
      model: this.model,
      contents: [{ role: "user", parts }],
      config: {
        systemInstruction: req.system,
        temperature: 0.2,
        maxOutputTokens: 2048,
        abortSignal: AbortSignal.timeout(req.timeoutMs),
        ...(req.jsonSchema ? { responseMimeType: "application/json", responseJsonSchema: req.jsonSchema } : {}),
      },
    });
    return res.text ?? "";
  }
}

let shared: TextModel | null = null;

export function getTextModel(): TextModel {
  shared ??= new GeminiModel(process.env.GEMINI_MODEL || "gemini-3.8-flash");
  return shared;
}

/** Test hook. */
export function setTextModelForTesting(model: TextModel | null): void {
  shared = model;
}
