import { describe, expect, it } from "vitest";

import {
  ACTIVITY_MULTIPLIERS,
  achievableWeeklyLoss,
  basalMetabolicRate,
  clamp,
  computeJourney,
  computeTargets,
  formatWeight,
  formatWeightDelta,
  kgToLb,
  linearFit,
  round,
  scoreDay,
} from "@/lib/nutrition";

/**
 * These numbers are the whole point of the app — if the targets drift, every
 * screen lies. Mifflin-St Jeor is a published formula, so it is checked against
 * hand-calculated values rather than a snapshot of whatever the code does now.
 */
describe("basalMetabolicRate (Mifflin-St Jeor)", () => {
  it("matches the published formula for men", () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5
    expect(
      basalMetabolicRate({ weightKg: 80, heightCm: 180, age: 30, gender: "male" }),
    ).toBe(1780);
  });

  it("matches the published formula for women", () => {
    // 10*65 + 6.25*165 - 5*30 - 161 = 650 + 1031.25 - 150 - 161
    expect(
      basalMetabolicRate({ weightKg: 65, heightCm: 165, age: 30, gender: "female" }),
    ).toBe(1370.25);
  });

  it("never returns a physiologically absurd floor", () => {
    const tiny = basalMetabolicRate({
      weightKg: 30,
      heightCm: 120,
      age: 90,
      gender: "female",
    });
    expect(tiny).toBeGreaterThanOrEqual(800);
  });
});

describe("computeTargets", () => {
  const base = {
    age: 30,
    gender: "male" as const,
    heightCm: 180,
    weightKg: 95,
    targetWeightKg: 80,
    weeklyLossKg: 0.5,
    activityLevel: "light" as const,
  };

  it("applies the activity multiplier to BMR", () => {
    const t = computeTargets(base);
    const bmr = basalMetabolicRate(base);
    expect(t.tdee).toBe(Math.round(bmr * ACTIVITY_MULTIPLIERS.light));
  });

  it("turns the weekly loss goal into a daily deficit", () => {
    const t = computeTargets(base);
    // 0.5kg/week * 7700 kcal/kg / 7 days = 550/day
    expect(t.deficit).toBeCloseTo(550, 0);
    expect(t.calories).toBe(t.tdee - t.deficit);
  });

  it("refuses to recommend a starvation intake, and says when it clamped", () => {
    const aggressive = computeTargets({ ...base, weeklyLossKg: 2 });
    expect(aggressive.deficitClamped).toBe(true);
    expect(aggressive.calories).toBeGreaterThanOrEqual(1500);
    // The honest deficit is reported, not the one that was asked for.
    expect(aggressive.deficit).toBeLessThan((2 * 7700) / 7);
  });

  it("reports the loss rate the clamped target can actually deliver", () => {
    const aggressive = computeTargets({ ...base, weeklyLossKg: 2 });
    expect(achievableWeeklyLoss(aggressive)).toBeLessThan(2);
    expect(achievableWeeklyLoss(aggressive)).toBeGreaterThan(0);
  });

  it("keeps macros consistent with the calorie target", () => {
    const t = computeTargets(base);
    const fromMacros = t.protein * 4 + t.carbs * 4 + t.fat * 9;
    // Rounding each macro independently allows a little slack, not a lot.
    expect(Math.abs(fromMacros - t.calories)).toBeLessThan(30);
  });

  it("anchors protein near goal weight so it does not balloon", () => {
    const heavy = computeTargets({ ...base, weightKg: 160, targetWeightKg: 80 });
    expect(heavy.protein).toBeLessThanOrEqual(240);
    expect(heavy.protein).toBeGreaterThan(70);
  });
});

describe("scoreDay", () => {
  const targets = computeTargets({
    age: 30,
    gender: "male",
    heightCm: 180,
    weightKg: 95,
    targetWeightKg: 80,
    weeklyLossKg: 0.5,
    activityLevel: "light",
  });

  const macros = (over: Partial<Record<string, number>> = {}) => ({
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
    sugar: 0,
    ...over,
  });

  it("treats a day with nothing logged as unlogged, not as a zero-calorie win", () => {
    const r = scoreDay({ totals: macros(), targets, entryCount: 0 });
    expect(r.status).toBe("unlogged");
    expect(r.score).toBe(0);
  });

  it("rewards hitting the targets", () => {
    const r = scoreDay({
      totals: macros({
        calories: targets.calories,
        protein: targets.protein,
        fiber: targets.fiber,
      }),
      targets,
      entryCount: 4,
    });
    expect(r.score).toBeGreaterThanOrEqual(82);
    expect(r.status).toBe("great");
  });

  it("marks a big overshoot as over rather than under", () => {
    const r = scoreDay({
      totals: macros({ calories: targets.calories * 1.8, protein: 40 }),
      targets,
      entryCount: 3,
    });
    expect(r.status).toBe("over");
  });

  it("marks a very light day as under", () => {
    const r = scoreDay({
      totals: macros({ calories: targets.calories * 0.3, protein: 10 }),
      targets,
      entryCount: 1,
    });
    expect(r.status).toBe("under");
  });

  it("never leaves the 0-100 range", () => {
    const absurd = scoreDay({
      totals: macros({ calories: 99999, protein: 9999, fiber: 9999 }),
      targets,
      entryCount: 99,
    });
    expect(absurd.score).toBeGreaterThanOrEqual(0);
    expect(absurd.score).toBeLessThanOrEqual(100);
  });
});

describe("computeJourney", () => {
  const from = { weeklyLossKg: 0.5, fromIsoDate: "2026-08-27" };

  it("reports progress between start and goal", () => {
    const j = computeJourney({
      startKg: 100,
      currentKg: 90,
      targetKg: 80,
      ...from,
    });
    expect(j.percent).toBeCloseTo(0.5, 2);
    expect(j.lostKg).toBeCloseTo(10, 5);
    expect(j.remainingKg).toBeCloseTo(10, 5);
  });

  it("projects a finish date from the weekly rate", () => {
    const j = computeJourney({
      startKg: 100,
      currentKg: 90,
      targetKg: 80,
      ...from,
    });
    // 10kg left at 0.5kg/week = 20 weeks.
    expect(j.weeksLeft).toBeCloseTo(20, 1);
    expect(j.etaIso).toBe("2027-01-14");
  });

  it("gives no ETA when the rate is zero, rather than an infinite one", () => {
    const j = computeJourney({
      startKg: 100,
      currentKg: 90,
      targetKg: 80,
      weeklyLossKg: 0,
      fromIsoDate: "2026-08-27",
    });
    expect(j.weeksLeft).toBeNull();
    expect(j.etaIso).toBeNull();
  });

  it("does not report negative progress for a gain", () => {
    const j = computeJourney({
      startKg: 100,
      currentKg: 105,
      targetKg: 80,
      ...from,
    });
    expect(j.percent).toBeGreaterThanOrEqual(0);
  });

  it("survives a start weight equal to the goal without dividing by zero", () => {
    const j = computeJourney({
      startKg: 80,
      currentKg: 80,
      targetKg: 80,
      ...from,
    });
    expect(Number.isFinite(j.percent)).toBe(true);
    expect(j.percent).toBe(1);
  });
});

describe("linearFit", () => {
  it("recovers the slope of a clean line", () => {
    const fit = linearFit([
      { x: 0, y: 100 },
      { x: 1, y: 99 },
      { x: 2, y: 98 },
      { x: 3, y: 97 },
    ]);
    expect(fit).not.toBeNull();
    expect(fit!.slope).toBeCloseTo(-1, 6);
    expect(fit!.intercept).toBeCloseTo(100, 6);
  });

  // Degenerate input has no line through it, and inventing one would show a
  // confident trend arrow from a single weigh-in. Callers null-check instead.
  it("returns null rather than a fabricated trend for one point", () => {
    expect(linearFit([{ x: 5, y: 80 }])).toBeNull();
  });

  it("returns null for an empty series", () => {
    expect(linearFit([])).toBeNull();
  });

  it("returns null when every x is identical, avoiding a divide by zero", () => {
    expect(
      linearFit([
        { x: 2, y: 80 },
        { x: 2, y: 81 },
      ]),
    ).toBeNull();
  });
});

describe("units and formatting", () => {
  it("round-trips kg to lb", () => {
    expect(kgToLb(1)).toBeCloseTo(2.2046, 3);
  });

  it("formats weight in the chosen unit", () => {
    expect(formatWeight(80, "metric")).toBe("80 kg");
    expect(formatWeight(80, "imperial")).toBe("176.4 lb");
  });

  it("uses a real minus sign and an explicit plus for deltas", () => {
    expect(formatWeightDelta(-0.8, "metric")).toBe("−0.8 kg");
    expect(formatWeightDelta(0.8, "metric")).toBe("+0.8 kg");
  });

  it("clamps and rounds predictably", () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(round(1.2345, 2)).toBe(1.23);
    expect(round(1.005, 2)).toBeCloseTo(1.0, 1);
  });
});
