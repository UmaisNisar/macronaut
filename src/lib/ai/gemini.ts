import "server-only";

import type { ZodType } from "zod";

import { geminiFallbackModels, geminiModel } from "@/lib/env";

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
  /** The key this call is spent on — see resolveAiAccess. Null means no model. */
  apiKey: string | null;
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
  | {
      ok: false;
      /** `key`: Google refused the key itself, so no other model will help. */
      reason: "unconfigured" | "key" | "network" | "api" | "invalid";
      detail: string;
    };

/**
 * Google's ways of saying the key is the problem: wrong, expired, deleted,
 * restricted away from this API, or on a project with the API switched off.
 * Not a bare PERMISSION_DENIED: one model can refuse a key the others accept.
 */
const KEY_REFUSED =
  /API_KEY_INVALID|API key not valid|API key expired|API_KEY_SERVICE_BLOCKED|SERVICE_DISABLED/i;

export function isKeyRefusal(status: number, body: string): boolean {
  return (status === 400 || status === 401 || status === 403) && KEY_REFUSED.test(body);
}

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
  const { apiKey } = options;
  if (!apiKey) {
    return { ok: false, reason: "unconfigured", detail: "No Gemini key for this account" };
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

  /*
   * A chain, not a single backup.
   *
   * Gemini's free tier meters GenerateRequestsPerDayPerProjectPerModel, and on
   * this project that limit is twenty. Per model — so each additional model in
   * the chain is another twenty requests a day, and a single spare one is not
   * much of a spare. Ordered best-quality first; the app only walks down the
   * list when something above it is exhausted or broken.
   *
   * This is a way of living within a free tier, not a substitute for paying for
   * one. Enabling billing removes the ceiling entirely.
   */
  const models = [
    geminiModel,
    ...geminiFallbackModels.filter((m) => m && m !== geminiModel),
  ];

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
              "x-goog-api-key": apiKey,
            },
            body,
            signal: AbortSignal.timeout(timeoutMs),
            cache: "no-store",
          },
        );

        if (!response.ok) {
          const text = (await response.text()).slice(0, 400);
          lastDetail = `${model}: ${response.status} ${text}`;
          // The key is shared by every model in the chain, so walking down it
          // would only collect the same refusal five more times.
          if (isKeyRefusal(response.status, text)) {
            return { ok: false, reason: "key", detail: lastDetail };
          }
          // A daily quota does not refill in the second it takes to retry, so
          // 429 moves straight to the next model instead of burning a retry.
          if (response.status === 429) break;
          // Other 4xx will not fix themselves either, but a different model
          // might not share the objection — remember it and carry on down.
          if (response.status < 500) {
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

export type KeyCheck =
  | { ok: true }
  | { ok: false; reason: "invalid" | "unreachable"; message: string };

/**
 * Whether a pasted key works, without spending any of its quota.
 *
 * Listing models is free and needs the same permission generation does, so a
 * key that passes this will work for logging.
 */
export async function checkGeminiKey(apiKey: string): Promise<KeyCheck> {
  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}?pageSize=1`, {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      reason: "unreachable",
      message: "Google could not be reached just now. Try again in a moment.",
    };
  }

  if (response.ok) return { ok: true };

  const body = (await response.text()).slice(0, 600);
  // Rate-limited means Google recognised the key; it is simply busy.
  if (response.status === 429) return { ok: true };
  if (isKeyRefusal(response.status, body)) {
    return {
      ok: false,
      reason: "invalid",
      message: /SERVICE_DISABLED|has not been used/i.test(body)
        ? "That key belongs to a project without the Gemini API switched on. Create the key in Google AI Studio instead."
        : "Google did not accept that key. Copy it again from AI Studio — the whole thing, starting with AIza.",
    };
  }
  return {
    ok: false,
    reason: "unreachable",
    message: `Google answered with an error (${response.status}). Try again in a moment.`,
  };
}
