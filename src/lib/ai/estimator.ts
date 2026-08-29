import type { AiFoodAnalysis, AiFoodItem, MealSlot } from "@/lib/schemas";
import { resolveFoodEmoji } from "@/lib/food-emoji";
import { ALIAS_INDEX, type FoodDef } from "@/lib/ai/food-table";

/**
 * Deterministic fallback for when Gemini is unavailable (no key, rate limited,
 * offline). Nowhere near as good as the model — but it keeps the core loop of
 * the app alive instead of showing an error, and it is honest about confidence.
 */

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  half: 0.5, couple: 2, few: 3, several: 3, some: 1,
};

/**
 * Rough multipliers for the words people actually use. Deliberately blunt: the
 * estimator only runs when the model is unavailable, and a sensible ratio beats
 * treating "large" as identical to "small".
 */
const SIZE_WORDS: { re: RegExp; factor: number; label: string }[] = [
  { re: /\b(extra large|xl|jumbo)\b/, factor: 2, label: "extra large" },
  { re: /\b(double)\b/, factor: 2, label: "double" },
  { re: /\b(large|big)\b/, factor: 1.5, label: "large" },
  { re: /\b(regular|medium|standard)\b/, factor: 1, label: "regular" },
  { re: /\bhalf\b/, factor: 0.5, label: "half a" },
  { re: /\b(small|mini|kiddie|kids?)\b/, factor: 0.65, label: "small" },
];

const MEAL_CUES: { cue: RegExp; meal: MealSlot }[] = [
  { cue: /\bbreakfast|morning|sehri|suhoor\b/, meal: "breakfast" },
  { cue: /\blunch|midday|noon\b/, meal: "lunch" },
  { cue: /\bdinner|supper|evening meal|iftar\b/, meal: "dinner" },
  { cue: /\bsnack|snacked|munch/, meal: "snack" },
  { cue: /\bdrank|drink|sipped\b/, meal: "drink" },
];

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9.,;+&\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Break free text into one clause per plausible food mention. */
function splitClauses(text: string): string[] {
  return text
    .split(/[.;\n]|,| and | then | also | plus | followed by | with /gi)
    .map((c) => c.trim())
    .filter((c) => c.length > 1);
}

function detectMeal(clause: string, carried: MealSlot | null): MealSlot | null {
  for (const { cue, meal } of MEAL_CUES) if (cue.test(clause)) return meal;
  return carried;
}

function parseQuantity(clause: string, food: FoodDef): {
  multiplier: number;
  label: string;
  fromGrams: boolean;
} {
  // "200g chicken" / "150 grams of rice"
  const gramMatch = clause.match(/(\d+(?:\.\d+)?)\s*(?:g|gs|gram|grams|gm)\b/);
  if (gramMatch && food.grams) {
    const grams = Number.parseFloat(gramMatch[1]);
    return {
      multiplier: grams / food.grams,
      label: `${Math.round(grams)} g`,
      fromGrams: true,
    };
  }

  const digits = clause.match(/(\d+(?:\.\d+)?)\s*(?:x\s*)?/);
  if (digits) {
    const n = Number.parseFloat(digits[1]);
    if (n > 0 && n <= 30) {
      return { multiplier: n, label: quantityLabel(n, food), fromGrams: false };
    }
  }

  for (const [word, value] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(clause)) {
      return {
        multiplier: value,
        label: quantityLabel(value, food),
        fromGrams: false,
      };
    }
  }

  // Size words, which people use far more often than numbers when ordering.
  // Without these, "tahini chicken large" and "a small chicken" estimate the
  // same, which is the kind of obviously-wrong answer that makes the whole
  // number untrustworthy.
  const size = SIZE_WORDS.find(({ re }) => re.test(clause));
  if (size) {
    return {
      multiplier: size.factor,
      label: `${size.label} ${food.unit.replace(/^\d+(\.\d+)?\s*/, "").trim() || "serving"}`,
      fromGrams: false,
    };
  }

  return { multiplier: 1, label: food.unit, fromGrams: false };
}

function quantityLabel(n: number, food: FoodDef): string {
  if (n === 1) return food.unit;
  // "1 slice" -> "3 slices"; "1 plate" -> "2 plates"
  const stripped = food.unit.replace(/^\d+(\.\d+)?\s*/, "").trim();
  if (!stripped) return `${n}`;
  const plural = /s$|ss$/.test(stripped) ? stripped : `${stripped}s`;
  return `${n % 1 === 0 ? n : n.toFixed(1)} ${plural}`;
}

function matchFood(clause: string): FoodDef | null {
  for (const { alias, food } of ALIAS_INDEX) {
    if (clause.includes(alias)) return food;
  }
  return null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function estimateFromText(input: string): AiFoodAnalysis {
  const text = normalise(input);
  const clauses = splitClauses(text);

  const foods: AiFoodItem[] = [];
  const assumptions = new Set<string>();
  const usedIds = new Set<string>();

  let carriedMeal: MealSlot | null = null;

  for (const clause of clauses) {
    carriedMeal = detectMeal(clause, carriedMeal);

    const food = matchFood(clause);
    if (!food) continue;
    // The same dish mentioned twice in one entry is almost always one dish.
    if (usedIds.has(food.id)) continue;
    usedIds.add(food.id);

    const qty = parseQuantity(clause, food);
    const m = qty.multiplier;

    // Built before the item, so nothing depends on mutating an array that
    // has already been handed over.
    const itemNotes =
      m === 1 && !qty.fromGrams
        ? [`Assumed ${food.unit} of ${food.label.toLowerCase()}.`]
        : [];

    foods.push({
      name: food.label,
      emoji: resolveFoodEmoji(food.label, food.emoji),
      meal: carriedMeal ?? food.meal ?? "snack",
      estimatedQuantity: qty.label,
      calories: Math.round(food.kcal * m),
      protein: r1(food.p * m),
      carbs: r1(food.c * m),
      fat: r1(food.f * m),
      fiber: r1((food.fib ?? 0) * m),
      sugar: r1((food.sug ?? 0) * m),
      confidence: qty.fromGrams ? "medium" : m === 1 ? "low" : "medium",
      assumptions: itemNotes,
      alternatives: [],
    });

  }

  if (!foods.length) {
    // Better to log something the user can correct than to lose the entry.
    foods.push({
      name: input.trim().slice(0, 60) || "Unidentified meal",
      emoji: resolveFoodEmoji(input),
      meal: carriedMeal ?? "snack",
      estimatedQuantity: "1 serving",
      assumptions: [],
      alternatives: [],
      calories: 400,
      protein: 18,
      carbs: 45,
      fat: 15,
      fiber: 3,
      sugar: 5,
      confidence: "low",
    });
    assumptions.add(
      "Nothing in the offline food table matched this, so a mid-sized mixed meal was assumed. Tap the entry to correct it.",
    );
  }

  return {
    foods,
    assumptions: [...assumptions].slice(0, 6),
    note: "Estimated offline from Macronaut's built-in food table.",
  };
}
