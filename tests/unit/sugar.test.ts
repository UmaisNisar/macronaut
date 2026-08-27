import { describe, expect, it } from "vitest";

import { computeTargets } from "@/lib/nutrition";
import { Targets } from "@/lib/schemas";

const base = {
  age: 30,
  gender: "male" as const,
  heightCm: 180,
  weightKg: 95,
  targetWeightKg: 80,
  weeklyLossKg: 0.5,
  activityLevel: "light" as const,
};

/**
 * The sugar ceiling follows the WHO guideline of free sugars under 10% of
 * energy. What the app actually logs is *total* sugars, so this is a line worth
 * watching rather than a hard rule — which is why it is shown but deliberately
 * kept out of the daily score.
 */
describe("sugar target", () => {
  it("is 10% of the calorie target, expressed in grams", () => {
    const t = computeTargets(base);
    expect(t.sugar).toBe(Math.round((t.calories * 0.1) / 4));
  });

  it("lands somewhere sane for a normal target", () => {
    const t = computeTargets(base);
    // ~1950 kcal should give roughly 49g.
    expect(t.sugar).toBeGreaterThan(30);
    expect(t.sugar).toBeLessThan(70);
  });

  it("scales with the calorie target rather than being fixed", () => {
    const small = computeTargets({ ...base, weightKg: 55, targetWeightKg: 52 });
    const large = computeTargets({ ...base, weightKg: 130, weeklyLossKg: 0.25 });
    expect(large.sugar).toBeGreaterThan(small.sugar);
  });

  it("stays well under the carb target, since sugar is a subset of carbs", () => {
    const t = computeTargets(base);
    expect(t.sugar).toBeLessThan(t.carbs);
  });
});

/**
 * Targets are stored as JSON on every goal snapshot, and the ones written
 * before sugar existed have no such key. Parsing must not break on them.
 */
describe("older stored targets", () => {
  const legacy = {
    bmr: 1780,
    tdee: 2450,
    calories: 1900,
    deficit: 550,
    protein: 150,
    carbs: 210,
    fat: 60,
    fiber: 27,
    deficitClamped: false,
  };

  it("still parses when sugar is absent", () => {
    const parsed = Targets.parse(legacy);
    expect(parsed.sugar).toBe(0);
  });

  it("keeps a real value when one is present", () => {
    const parsed = Targets.parse({ ...legacy, sugar: 48 });
    expect(parsed.sugar).toBe(48);
  });
});
