import { describe, expect, it } from "vitest";

import { topSugarSources } from "@/lib/insights";
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

/* ------------------------------------------------------------------ */
/* Where the sugar came from                                           */
/* ------------------------------------------------------------------ */

const src = (name: string, sugar: number, emoji = "🍬") => ({
  name,
  emoji,
  sugar,
});

describe("topSugarSources", () => {
  it("groups the same food and adds it up", () => {
    const out = topSugarSources([
      src("Activia yogurt", 12),
      src("activia  YOGURT", 12),
      src("Banana", 14),
    ]);

    expect(out[0]).toMatchObject({ name: "Activia yogurt", sugar: 24, times: 2 });
    expect(out[1]).toMatchObject({ name: "Banana", sugar: 14, times: 1 });
  });

  it("ranks by total, not by how often something was eaten", () => {
    const out = topSugarSources([
      src("Tea", 3),
      src("Tea", 3),
      src("Tea", 3),
      src("Slice of cake", 30),
    ]);

    expect(out[0].name).toBe("Slice of cake");
    expect(out[0].times).toBe(1);
  });

  it("reports each food's share of the window", () => {
    const out = topSugarSources([src("Juice", 30), src("Milk", 10)]);

    expect(out[0].share).toBeCloseTo(0.75, 5);
    expect(out[1].share).toBeCloseTo(0.25, 5);
    expect(out.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1, 5);
  });

  it("ignores foods with no sugar rather than listing them at zero", () => {
    const out = topSugarSources([src("Chicken breast", 0), src("Apple", 19)]);

    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Apple");
  });

  it("keeps only the top few", () => {
    const many = Array.from({ length: 12 }, (_, i) => src(`Food ${i}`, i + 1));
    expect(topSugarSources(many)).toHaveLength(5);
    expect(topSugarSources(many, 3)).toHaveLength(3);
  });

  it("has nothing to say about a window with no sugar in it", () => {
    expect(topSugarSources([])).toEqual([]);
    expect(topSugarSources([src("Water", 0)])).toEqual([]);
  });

  it("survives a bad number without poisoning every share", () => {
    const out = topSugarSources([
      src("Mystery", Number.NaN),
      src("Orange", 12),
    ]);

    expect(out).toHaveLength(1);
    expect(out[0].share).toBe(1);
  });
});
