import { describe, expect, it } from "vitest";

import { weekBudget } from "@/lib/insights";
import type { DailyLog } from "@/lib/schemas";

/*
 * Weeks run Monday to Sunday. 2026-08-24 is a Monday, so 2026-08-27 is the
 * Thursday used as "today" throughout — four days elapsed, three still to come.
 */
const MON = "2026-08-24";
const THU = "2026-08-27";
const SUN = "2026-08-30";

function day(logDate: string, calories: number, target = 2000): DailyLog {
  return {
    id: `d-${logDate}`,
    userId: "u",
    logDate,
    entryCount: 3,
    score: 70,
    status: "solid",
    targets: {
      calories: target,
      protein: 150,
      carbs: 220,
      fat: 60,
      fiber: 30,
      sugar: 50,
    },
    totals: { calories, protein: 120, carbs: 200, fat: 60, fiber: 25, sugar: 40 },
    coach: null,
  } as unknown as DailyLog;
}

describe("weekBudget", () => {
  it("runs Monday to Sunday around whatever day it is", () => {
    const w = weekBudget([], THU, 2000);
    expect(w.startIso).toBe(MON);
    expect(w.endIso).toBe(SUN);
    expect(w.days).toHaveLength(7);
    expect(w.days.filter((d) => d.isFuture)).toHaveLength(3);
    expect(w.days.find((d) => d.isToday)?.iso).toBe(THU);
  });

  it("totals the week's target from each day's own plan", () => {
    const w = weekBudget([], THU, 2000);
    expect(w.weekTarget).toBe(14000);
  });

  /*
   * The reason this is a sum and not a multiplication: a weigh-in rewrites the
   * plan from that day forward, so one week can span two daily targets.
   */
  it("handles a target that changes mid-week", () => {
    const logs = [
      day(MON, 2000, 2100),
      day("2026-08-25", 2000, 2100),
      day("2026-08-26", 2000, 1900),
      day(THU, 2000, 1900),
    ];
    // 2100+2100+1900+1900 logged, plus 3 unlogged days at the 1900 fallback.
    expect(weekBudget(logs, THU, 1900).weekTarget).toBe(13700);
  });

  it("spreads what is left across the days that remain, today included", () => {
    // Ate 2500 a day Mon-Thu against 2000: 10000 eaten of a 14000 week.
    const logs = ["2026-08-24", "2026-08-25", "2026-08-26", THU].map((d) =>
      day(d, 2500),
    );
    const w = weekBudget(logs, THU, 2000);
    expect(w.eaten).toBe(10000);
    expect(w.remaining).toBe(4000);
    // Thursday itself plus Fri, Sat, Sun.
    expect(w.daysLeft).toBe(4);
    expect(w.perDayLeft).toBe(1000);
  });

  it("counts today as a day still to come", () => {
    const w = weekBudget([], SUN, 2000);
    expect(w.daysLeft).toBe(1);
    // Nothing eaten all week, so the whole budget lands on Sunday.
    expect(w.perDayLeft).toBe(14000);
  });

  /*
   * The headline case the user described: overspend early, then find out what
   * the rest of the week has to look like.
   */
  it("goes negative when the week is already blown", () => {
    const logs = ["2026-08-24", "2026-08-25", "2026-08-26", THU].map((d) =>
      day(d, 4000),
    );
    const w = weekBudget(logs, THU, 2000);
    expect(w.eaten).toBe(16000);
    expect(w.remaining).toBe(-2000);
    expect(w.perDayLeft).toBeLessThan(0);
  });

  /*
   * Today is half-eaten by definition. Folding its full target into "how am I
   * doing" would show a fat surplus every morning that evaporates by dinner,
   * so the balance only counts days that are actually finished.
   */
  it("measures balance on settled days only, never today", () => {
    const logs = [
      day(MON, 2500),
      day("2026-08-25", 2500),
      day("2026-08-26", 2500),
      day(THU, 100), // barely started
    ];
    const w = weekBudget(logs, THU, 2000);
    expect(w.balance).toBe(1500); // 3 x 500 over, today excluded
  });

  it("reports a surplus as a negative balance", () => {
    const logs = [day(MON, 1500), day("2026-08-25", 1500)];
    // Wednesday unlogged counts as 0 eaten against a 2000 target.
    expect(weekBudget(logs, THU, 2000).balance).toBe(-3000);
  });

  /*
   * An unlogged day looks identical to a day of eating nothing, which hands
   * back a whole day's calories as spendable. The count is surfaced so the
   * UI can say so rather than quietly inflating the allowance.
   */
  it("counts elapsed days with nothing logged", () => {
    const w = weekBudget([day(MON, 2000)], THU, 2000);
    expect(w.unloggedPast).toBe(2); // Tue and Wed; today is not settled
  });

  it("does not count today or future days as unlogged", () => {
    const logs = ["2026-08-24", "2026-08-25", "2026-08-26"].map((d) => day(d, 2000));
    expect(weekBudget(logs, THU, 2000).unloggedPast).toBe(0);
  });

  it("survives an empty week without dividing by zero", () => {
    const w = weekBudget([], MON, 2000);
    expect(w.daysLeft).toBe(7);
    expect(w.eaten).toBe(0);
    expect(Number.isFinite(w.perDayLeft)).toBe(true);
  });

  it("ignores days outside the current week", () => {
    const logs = [day("2026-08-23", 9999), day("2026-08-31", 9999), day(MON, 2000)];
    expect(weekBudget(logs, THU, 2000).eaten).toBe(2000);
  });
});
