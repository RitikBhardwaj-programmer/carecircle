import { logger } from "./logger";
import type { TextModel } from "./gemini";

/**
 * Optional OpenAI Chat Completions model (POST /v1/chat/completions) with built-in fetch, no SDK.
 * Used only as a reliability fallback for the assistant. The model id comes from OPENAI_MODEL.
 */
export class OpenAIModel implements TextModel {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async generate(req: Parameters<TextModel["generate"]>[0]): Promise<string> {
    if (req.image) throw new Error("OpenAI fallback is text only");
    const res = await this.fetchFn("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        messages: [
          // JSON mode needs the word "JSON" in the instructions.
          {
            role: "system",
            content: req.jsonSchema ? `${req.system} Reply with one JSON object only.` : req.system,
          },
          { role: "user", content: req.prompt },
        ],
        max_completion_tokens: 2048,
        ...(req.jsonSchema ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(Math.min(req.timeoutMs, 15_000)),
    });
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
    return body.choices?.[0]?.message?.content ?? "";
  }
}

/** Calls the primary model; on any error calls the secondary once. Logs no user text. */
export function withFallback(primary: TextModel, secondary: TextModel): TextModel {
  return {
    async generate(req) {
      try {
        return await primary.generate(req);
      } catch (err) {
        logger.warn("ai.fallback", { error: (err as Error).name });
        return secondary.generate(req);
      }
    },
  };
}

/** The fallback is on only when both OPENAI_API_KEY and OPENAI_MODEL are set. */
export function openAIFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): TextModel | null {
  const key = env.OPENAI_API_KEY?.trim();
  const model = env.OPENAI_MODEL?.trim();
  return key && model ? new OpenAIModel(key, model) : null;
}
