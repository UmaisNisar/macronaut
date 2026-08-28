import { describe, expect, it } from "vitest";

import {
  buildInsights,
  computeStreaks,
  periodPair,
  summarisePeriod,
  weightStats,
} from "@/lib/insights";
import { computeTargets } from "@/lib/nutrition";
import type { DailyLog, WeightLog } from "@/lib/schemas";

const targets = computeTargets({
  age: 30,
  gender: "male",
  heightCm: 180,
  weightKg: 95,
  targetWeightKg: 80,
  weeklyLossKg: 0.5,
  activityLevel: "light",
});

function day(logDate: string, calories: number, entryCount = 3): DailyLog {
  return {
    id: `d-${logDate}`,
    userId: "u",
    logDate,
    entryCount,
    score: 0,
    status: "solid",
    targets,
    totals: {
      calories,
      protein: 120,
      carbs: 200,
      fat: 60,
      fiber: 25,
      sugar: 40,
    },
    coach: null,
    createdAt: `${logDate}T12:00:00.000Z`,
  } as unknown as DailyLog;
}

function weigh(loggedOn: string, weightKg: number): WeightLog {
  return {
    id: `w-${loggedOn}`,
    userId: "u",
    loggedOn,
    weightKg,
    note: null,
    coach: null,
    createdAt: `${loggedOn}T08:00:00.000Z`,
  };
}

describe("computeStreaks", () => {
  it("counts consecutive logged days up to today", () => {
    const s = computeStreaks(
      [
        day("2026-08-25", 2000),
        day("2026-08-26", 2000),
        day("2026-08-27", 2000),
      ],
      "2026-08-27",
    );
    expect(s.logging).toBe(3);
    expect(s.totalDaysLogged).toBe(3);
  });

  /**
   * The generous rule matters: opening the app before breakfast should not
   * look like you have already broken a three-week run.
   */
  it("does not break the streak just because today is not logged yet", () => {
    const s = computeStreaks(
      [day("2026-08-25", 2000), day("2026-08-26", 2000)],
      "2026-08-27",
    );
    expect(s.logging).toBe(2);
  });

  it("stops at a genuine gap", () => {
    const s = computeStreaks(
      [
        day("2026-08-20", 2000),
        day("2026-08-21", 2000),
        // 22nd missing
        day("2026-08-26", 2000),
        day("2026-08-27", 2000),
      ],
      "2026-08-27",
    );
    expect(s.logging).toBe(2);
    expect(s.longestLogging).toBeGreaterThanOrEqual(2);
    expect(s.totalDaysLogged).toBe(4);
  });

  it("ignores days that exist but have nothing logged", () => {
    const s = computeStreaks(
      [day("2026-08-26", 0, 0), day("2026-08-27", 0, 0)],
      "2026-08-27",
    );
    expect(s.logging).toBe(0);
    expect(s.totalDaysLogged).toBe(0);
  });

  it("handles an empty history", () => {
    const s = computeStreaks([], "2026-08-27");
    expect(s.logging).toBe(0);
    expect(s.longestLogging).toBe(0);
  });
});

describe("weightStats", () => {
  it("picks the latest and previous readings regardless of input order", () => {
    const s = weightStats(
      [weigh("2026-08-20", 96), weigh("2026-08-27", 94), weigh("2026-08-24", 95)],
      "2026-08-27",
    );
    expect(s.latest?.loggedOn).toBe("2026-08-27");
    expect(s.previous?.loggedOn).toBe("2026-08-24");
    expect(s.first?.loggedOn).toBe("2026-08-20");
    expect(s.count).toBe(3);
  });

  it("reports a loss over seven days as a negative change", () => {
    const s = weightStats(
      [weigh("2026-08-20", 96), weigh("2026-08-27", 94.5)],
      "2026-08-27",
    );
    expect(s.change7).toBeLessThan(0);
    expect(s.change7).toBeCloseTo(-1.5, 5);
  });

  it("has no trend from a single weigh-in", () => {
    const s = weightStats([weigh("2026-08-27", 94)], "2026-08-27");
    expect(s.ratePerWeek).toBeNull();
    expect(s.previous).toBeNull();
  });

  it("estimates a weekly rate once there is enough recent data", () => {
    const s = weightStats(
      [
        weigh("2026-08-07", 97),
        weigh("2026-08-14", 96),
        weigh("2026-08-21", 95),
        weigh("2026-08-27", 94.2),
      ],
      "2026-08-27",
    );
    expect(s.ratePerWeek).not.toBeNull();
    // Losing roughly a kilo a week, so the slope must be negative.
    expect(s.ratePerWeek!).toBeLessThan(0);
    expect(s.ratePerWeek!).toBeGreaterThan(-2);
  });

  it("survives an empty log without throwing", () => {
    const s = weightStats([], "2026-08-27");
    expect(s.latest).toBeNull();
    expect(s.count).toBe(0);
    expect(s.change7).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Sugar                                                               */
/* ------------------------------------------------------------------ */

/** A day whose sugar can be set independently of everything else. */
function sugarDay(logDate: string, sugar: number, ceiling = 50): DailyLog {
  const d = day(logDate, 2000);
  return {
    ...d,
    targets: { ...d.targets, sugar: ceiling },
    totals: { ...d.totals, sugar },
  };
}

describe("summarisePeriod, on sugar", () => {
  it("averages intake and counts the days that went over", () => {
    const s = summarisePeriod(
      [
        sugarDay("2026-08-25", 40),
        sugarDay("2026-08-26", 80),
        sugarDay("2026-08-27", 60),
      ],
      "2026-08-25",
      "2026-08-27",
    );

    expect(s.avgSugar).toBe(60);
    expect(s.avgSugarTarget).toBe(50);
    expect(s.daysOverSugar).toBe(2);
  });

  /**
   * Days logged before sugar was tracked carry a ceiling of zero. Averaging
   * those in would drag the ceiling towards nothing and make every day look
   * like a blowout.
   */
  it("ignores days that predate sugar tracking when averaging the ceiling", () => {
    const s = summarisePeriod(
      [sugarDay("2026-08-26", 40, 0), sugarDay("2026-08-27", 40, 50)],
      "2026-08-26",
      "2026-08-27",
    );

    expect(s.avgSugarTarget).toBe(50);
    expect(s.daysOverSugar).toBe(0);
  });
});

describe("buildInsights, on sugar", () => {
  const week = (start: number, sugar: number) =>
    Array.from({ length: 4 }, (_, i) =>
      sugarDay(`2026-08-${String(start + i).padStart(2, "0")}`, sugar),
    );

  it("says so when sugar has come down against the previous period", () => {
    const days = [...week(20, 90), ...week(24, 50)];
    const { current, previous } = periodPair(days, "2026-08-27", 4);
    const sugar = buildInsights(current, previous, []).find(
      (i) => i.id === "sugar",
    );

    expect(sugar?.direction).toBe("good");
    expect(sugar?.metric).toContain("40");
  });

  it("says so when it has gone up", () => {
    const days = [...week(20, 40), ...week(24, 95)];
    const { current, previous } = periodPair(days, "2026-08-27", 4);
    const sugar = buildInsights(current, previous, []).find(
      (i) => i.id === "sugar",
    );

    expect(sugar?.direction).toBe("bad");
  });

  it("stays quiet about a change too small to act on", () => {
    const days = [...week(20, 48), ...week(24, 52)];
    const { current, previous } = periodPair(days, "2026-08-27", 4);

    expect(
      buildInsights(current, previous, []).some((i) => i.id === "sugar"),
    ).toBe(false);
  });

  /** The blowout days are the point, and an average hides them. */
  it("reports days past the ceiling without needing a previous period", () => {
    const days = [sugarDay("2026-08-26", 120), sugarDay("2026-08-27", 30)];
    const { current, previous } = periodPair(days, "2026-08-27", 7);
    const overDays = buildInsights(current, previous, []).find(
      (i) => i.id === "sugar-days",
    );

    expect(overDays?.metric).toBe("1/2");
    expect(overDays?.text).toContain("50 g ceiling");
  });
});
