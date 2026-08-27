import "server-only";

import type { ZodType } from "zod";

import {
  geminiApiKey,
  geminiFallbackModel,
  geminiModel,
  isGeminiConfigured,
} from "@/lib/env";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/** The OpenAPI-flavoured subset Gemini accepts for `responseSchema`. */
export type GeminiSchema = {
  type: "OBJECT" | "ARRAY" | "STRING" | "NUMBER" | "INTEGER" | "BOOLEAN";
  description?: string;
  nullable?: boolean;
  enum?: string[];
  items?: GeminiSchema;
  properties?: Record<string, GeminiSchema>;
  required?: string[];
  propertyOrdering?: string[];
};

export type GenerateOptions<T> = {
  system: string;
  prompt: string;
  schema: GeminiSchema;
  validator: ZodType<T>;
  temperature?: number;
  maxOutputTokens?: number;
  /** Reasoning tokens. 0 keeps latency low for the mechanical extraction jobs. */
  thinkingBudget?: number;
  /** Base64 image sent alongside the prompt, for reading a meal off a photo. */
  image?: { data: string; mimeType: string };
  timeoutMs?: number;
};

export type GenerateResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "unconfigured" | "network" | "api" | "invalid"; detail: string };

function extractText(payload: unknown): string {
  const candidates = (payload as { candidates?: unknown[] })?.candidates;
  if (!Array.isArray(candidates) || !candidates.length) return "";
  const parts = (
    candidates[0] as { content?: { parts?: { text?: string }[] } }
  )?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((p) => p?.text ?? "")
    .join("")
    .trim();
}

/** Models occasionally wrap JSON in a fence despite responseMimeType. */
function stripFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

/**
 * One call, one validated object. Never throws: callers get a typed failure so
 * they can fall back to the deterministic path instead of showing an error.
 */
export async function generateJson<T>(
  options: GenerateOptions<T>,
): Promise<GenerateResult<T>> {
  if (!isGeminiConfigured) {
    return { ok: false, reason: "unconfigured", detail: "No GEMINI_API_KEY set" };
  }

  const {
    system,
    prompt,
    schema,
    validator,
    temperature = 0.4,
    maxOutputTokens = 2048,
    thinkingBudget = 0,
    timeoutMs = 30_000,
    image,
  } = options;

  const generationConfig: Record<string, unknown> = {
    responseMimeType: "application/json",
    responseSchema: schema,
    temperature,
    maxOutputTokens,
  };
  // `thinkingConfig` only exists on the 2.5+ family, and only Flash accepts a
  // budget of zero — Pro rejects anything below 128. Where we cannot be sure,
  // leave the model's default alone rather than 400 on every request.
  const thinkingFor = (model: string): Record<string, unknown> | null => {
    if (!/2\.5|3\./.test(model)) return null;
    if (/flash/i.test(model)) return { thinkingBudget };
    return thinkingBudget > 0
      ? { thinkingBudget: Math.max(128, thinkingBudget) }
      : null;
  };

  const bodyFor = (model: string) => {
    const thinking = thinkingFor(model);
    return JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [
        {
          role: "user",
          // Image first: Gemini attends better to a prompt that follows the
          // thing it is being asked about.
          parts: image
            ? [
                { inlineData: { mimeType: image.mimeType, data: image.data } },
                { text: prompt },
              ]
            : [{ text: prompt }],
        },
      ],
      generationConfig: thinking
        ? { ...generationConfig, thinkingConfig: thinking }
        : generationConfig,
    });
  };

  // The backup only exists to survive one model having a bad ten minutes.
  // Dropping straight to the keyword estimator loses far more quality than
  // answering from an older model does.
  const models =
    geminiFallbackModel && geminiFallbackModel !== geminiModel
      ? [geminiModel, geminiFallbackModel]
      : [geminiModel];

  let lastDetail = "";
  /** Set when the primary refused in a way a different model cannot fix. */
  let hardFailure: GenerateResult<T> | null = null;

  for (const model of models) {
    const body = bodyFor(model);

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(
          `${ENDPOINT}/${encodeURIComponent(model)}:generateContent`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-goog-api-key": geminiApiKey,
            },
            body,
            signal: AbortSignal.timeout(timeoutMs),
            cache: "no-store",
          },
        );

        if (!response.ok) {
          lastDetail = `${model}: ${response.status} ${(await response.text()).slice(0, 400)}`;
          // 4xx other than rate limiting will not fix itself on retry. An
          // unknown model or a rejected config might still work elsewhere, so
          // remember the failure and let the next model have a go.
          if (response.status < 500 && response.status !== 429) {
            hardFailure = { ok: false, reason: "api", detail: lastDetail };
            break;
          }
          continue;
        }

        const text = extractText(await response.json());
        if (!text) {
          lastDetail = `${model}: empty completion`;
          continue;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(stripFence(text));
        } catch {
          lastDetail = `Unparseable JSON: ${text.slice(0, 200)}`;
          continue;
        }

        const result = validator.safeParse(parsed);
        if (!result.success) {
          lastDetail = result.error.issues
            .slice(0, 4)
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ");
          continue;
        }

        if (model !== geminiModel) {
          console.warn(
            `[macronaut] answered with the fallback model ${model}; ${geminiModel} failed`,
          );
        }
        return { ok: true, data: result.data };
      } catch (error) {
        lastDetail = `${model}: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  }

  if (hardFailure && models.length === 1) return hardFailure;

  return {
    ok: false,
    reason: lastDetail.startsWith("Unparseable") ? "invalid" : "network",
    detail: lastDetail || "Gemini request failed",
  };
}
