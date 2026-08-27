import "server-only";

import type { AiFoodItem } from "@/lib/schemas";

/**
 * Packaged food, read off the label instead of guessed.
 *
 * For anything with a barcode the exact numbers already exist — asking a
 * language model to estimate a branded protein bar is strictly worse than
 * reading what the manufacturer printed. Open Food Facts is a free, open
 * database with no key required.
 *
 * Values are per 100g/ml, so a serving size has to be applied. When the
 * database has no serving size we say 100g rather than inventing a portion,
 * and the person can edit it — which now also teaches the app (see
 * food_corrections).
 */

const ENDPOINT = "https://world.openfoodfacts.org/api/v2/product";

/** Their guidelines ask for an identifying agent. */
const AGENT = "Macronaut/1.0 (personal nutrition tracker)";

export type BarcodeLookup =
  | { ok: true; food: AiFoodItem; brand: string | null; source: "openfoodfacts" }
  | { ok: false; reason: string };

type Nutriments = Record<string, number | string | undefined>;

function num(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * "330ml", "40 g", "1 bar (45g)" — take the first number with a unit. Anything
 * unparseable falls back to 100, matching how the figures are published.
 */
function servingGrams(raw: unknown): { grams: number; label: string } {
  if (typeof raw !== "string" || !raw.trim()) {
    return { grams: 100, label: "100 g" };
  }
  const match = raw.match(/([\d.]+)\s*(g|ml)/i);
  if (!match) return { grams: 100, label: "100 g" };
  const grams = Number(match[1]);
  if (!Number.isFinite(grams) || grams <= 0) return { grams: 100, label: "100 g" };
  return { grams, label: raw.trim() };
}

export async function lookupBarcode(code: string): Promise<BarcodeLookup> {
  if (!/^\d{6,14}$/.test(code)) {
    return { ok: false, reason: "That does not look like a barcode." };
  }

  let payload: { status?: number; product?: Record<string, unknown> };
  try {
    const response = await fetch(
      `${ENDPOINT}/${code}?fields=product_name,brands,quantity,serving_size,nutriments`,
      {
        headers: { "user-agent": AGENT, accept: "application/json" },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      },
    );
    if (!response.ok) {
      return { ok: false, reason: "The food database did not respond." };
    }
    payload = await response.json();
  } catch {
    return { ok: false, reason: "Could not reach the food database." };
  }

  const product = payload.product;
  if (payload.status !== 1 || !product) {
    return {
      ok: false,
      reason: "That barcode is not in the database yet. Try describing it instead.",
    };
  }

  const nutriments = (product.nutriments ?? {}) as Nutriments;
  const kcalPer100 = num(nutriments["energy-kcal_100g"]);
  if (kcalPer100 <= 0) {
    return {
      ok: false,
      reason: "That product has no nutrition data recorded. Try describing it instead.",
    };
  }

  const { grams, label } = servingGrams(product.serving_size);
  const scale = grams / 100;
  const brand =
    typeof product.brands === "string" && product.brands.trim()
      ? product.brands.split(",")[0].trim()
      : null;
  const name =
    (typeof product.product_name === "string" && product.product_name.trim()) ||
    "Packaged food";

  const round1 = (n: number) => Math.round(n * 10) / 10;

  return {
    ok: true,
    brand,
    source: "openfoodfacts",
    food: {
      name: brand ? `${brand} ${name}` : name,
      emoji: "🏷️",
      meal: "snack",
      estimatedQuantity: label,
      calories: Math.round(kcalPer100 * scale),
      protein: round1(num(nutriments.proteins_100g) * scale),
      carbs: round1(num(nutriments.carbohydrates_100g) * scale),
      fat: round1(num(nutriments.fat_100g) * scale),
      fiber: round1(num(nutriments.fiber_100g) * scale),
      sugar: round1(num(nutriments.sugars_100g) * scale),
      // Straight off the label, so this is the most confident the app ever is.
      confidence: "high",
      assumptions: [],
    },
  };
}
