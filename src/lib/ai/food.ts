import "server-only";

import { AiFoodAnalysis } from "@/lib/schemas";
import { generateJson } from "@/lib/ai/gemini";
import {
  FOOD_PHOTO_SYSTEM,
  FOOD_SCHEMA,
  FOOD_SYSTEM,
} from "@/lib/ai/prompts";
import { estimateFromText } from "@/lib/ai/estimator";
import { isGeminiConfigured } from "@/lib/env";

export type FoodAnalysisResult = {
  analysis: AiFoodAnalysis;
  source: "ai" | "estimator";
  /** Set when we silently fell back, so the UI can be upfront about it. */
  fallbackReason?: string;
};

/**
 * The macro sum should roughly reconcile with the calorie figure. When a model
 * item is wildly off we trust the macros, which are easier to get right, and
 * note the correction.
 */
function reconcile(analysis: AiFoodAnalysis): {
  analysis: AiFoodAnalysis;
  corrected: number;
} {
  let corrected = 0;
  const foods = analysis.foods.map((food) => {
    const fromMacros = food.protein * 4 + food.carbs * 4 + food.fat * 9;
    if (fromMacros < 20 || food.calories <= 0) return food;
    const ratio = food.calories / fromMacros;
    if (ratio > 1.35 || ratio < 0.7) {
      corrected++;
      return { ...food, calories: Math.round(fromMacros) };
    }
    return food;
  });
  return { analysis: { ...analysis, foods }, corrected };
}

/**
 * Read a meal off a photograph.
 *
 * Unlike the text path there is no offline fallback worth having: an estimator
 * cannot guess at pixels, so with no key or a failed call this reports the
 * failure and the caller asks the person to describe the meal instead. Better
 * an honest "type it out" than a fabricated plate of food.
 */
export async function analyseFoodPhoto(
  image: { data: string; mimeType: string },
  note?: string,
): Promise<
  { ok: true; analysis: AiFoodAnalysis } | { ok: false; reason: string }
> {
  if (!isGeminiConfigured) {
    return { ok: false, reason: "Photo logging needs the AI to be configured." };
  }

  const result = await generateJson({
    system: FOOD_PHOTO_SYSTEM,
    prompt: note?.trim()
      ? `Identify everything edible in this photo. The person adds: "${note.trim()}"`
      : "Identify everything edible in this photo and estimate the portions.",
    image,
    schema: FOOD_SCHEMA,
    validator: AiFoodAnalysis,
    temperature: 0.25,
    maxOutputTokens: 3072,
    // Reading a plate genuinely benefits from a moment's thought, unlike
    // parsing a sentence, so this one is not pinned to zero.
    thinkingBudget: 512,
    timeoutMs: 45_000,
  });

  if (!result.ok) {
    console.warn(
      `[macronaut] photo analysis failed (${result.reason}): ${result.detail}`,
    );
    return {
      ok: false,
      reason:
        result.reason === "unconfigured"
          ? "Photo logging needs the AI to be configured."
          : "That photo could not be read. Try again, or type what you ate.",
    };
  }

  const { analysis, corrected } = reconcile(result.data);
  if (corrected > 0) {
    analysis.assumptions = [
      ...analysis.assumptions,
      `Calorie figures for ${corrected} item${corrected > 1 ? "s" : ""} were rebalanced against their macros.`,
    ];
  }
  return { ok: true, analysis };
}

export async function analyseFood(text: string): Promise<FoodAnalysisResult> {
  if (!isGeminiConfigured) {
    return {
      analysis: estimateFromText(text),
      source: "estimator",
      fallbackReason: "no-key",
    };
  }

  const result = await generateJson({
    system: FOOD_SYSTEM,
    prompt: `Meal description:\n"""\n${text.trim()}\n"""`,
    schema: FOOD_SCHEMA,
    validator: AiFoodAnalysis,
    temperature: 0.25,
    maxOutputTokens: 3072,
    thinkingBudget: 0,
  });

  if (!result.ok) {
    // Falling back is by design, but doing it silently makes a degraded
    // install look like a working one. Always leave a trace.
    console.warn(
      `[macronaut] food analysis fell back to the offline estimator (${result.reason}): ${result.detail}`,
    );
    return {
      analysis: estimateFromText(text),
      source: "estimator",
      fallbackReason: result.detail,
    };
  }

  const { analysis, corrected } = reconcile(result.data);
  if (corrected > 0) {
    analysis.assumptions = [
      ...analysis.assumptions,
      `Calorie figures for ${corrected} item${corrected > 1 ? "s" : ""} were rebalanced against their macros.`,
    ];
  }

  return { analysis, source: "ai" };
}
