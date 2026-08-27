import "server-only";

import type { ZodType } from "zod";

import { geminiApiKey, geminiModel, isGeminiConfigured } from "@/lib/env";

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
  if (/2\.5|3\./.test(geminiModel)) {
    if (/flash/i.test(geminiModel)) {
      generationConfig.thinkingConfig = { thinkingBudget };
    } else if (thinkingBudget > 0) {
      generationConfig.thinkingConfig = {
        thinkingBudget: Math.max(128, thinkingBudget),
      };
    }
  }

  const body = JSON.stringify({
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
    generationConfig,
  });

  let lastDetail = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(
        `${ENDPOINT}/${encodeURIComponent(geminiModel)}:generateContent`,
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
        lastDetail = `${response.status} ${(await response.text()).slice(0, 400)}`;
        // 4xx other than rate limiting will not fix itself on retry.
        if (response.status < 500 && response.status !== 429) {
          return { ok: false, reason: "api", detail: lastDetail };
        }
        continue;
      }

      const text = extractText(await response.json());
      if (!text) {
        lastDetail = "Empty completion";
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

      return { ok: true, data: result.data };
    } catch (error) {
      lastDetail = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    ok: false,
    reason: lastDetail.startsWith("Unparseable") ? "invalid" : "network",
    detail: lastDetail || "Gemini request failed",
  };
}
