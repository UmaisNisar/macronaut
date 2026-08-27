import { describe, expect, it } from "vitest";

import { rankFrequentFoods } from "@/lib/db/store";
import {
  addDays,
  diffDays,
  isValidIso,
  lastNDays,
  relativeDayLabel,
  startOfWeek,
} from "@/lib/date";
import type { FoodEntry } from "@/lib/schemas";

function entry(
  name: string,
  createdAt: string,
  over: Partial<FoodEntry> = {},
): FoodEntry {
  return {
    id: `${name}-${createdAt}`,
    userId: "u",
    logDate: createdAt.slice(0, 10),
    meal: "lunch",
    name,
    quantity: "1 serving",
    emoji: "🍽️",
    calories: 200,
    protein: 10,
    carbs: 20,
    fat: 5,
    fiber: 2,
    sugar: 3,
    confidence: "medium",
    assumptions: [],
    rawInput: name,
    source: "ai",
    createdAt,
    ...over,
  } as FoodEntry;
}

describe("rankFrequentFoods", () => {
  it("collapses repeats of the same food into one suggestion", () => {
    const ranked = rankFrequentFoods(
      [
        entry("Porridge", "2026-08-20T08:00:00Z"),
        entry("Porridge", "2026-08-21T08:00:00Z"),
        entry("Porridge", "2026-08-22T08:00:00Z"),
      ],
      5,
    );
    expect(ranked).toHaveLength(1);
    expect(ranked[0].count).toBe(3);
  });

  it("matches case-insensitively, so Porridge and porridge are one food", () => {
    const ranked = rankFrequentFoods(
      [
        entry("Porridge", "2026-08-20T08:00:00Z"),
        entry("porridge", "2026-08-21T08:00:00Z"),
        entry("  PORRIDGE ", "2026-08-22T08:00:00Z"),
      ],
      5,
    );
    expect(ranked).toHaveLength(1);
    expect(ranked[0].count).toBe(3);
  });

  it("offers the most-eaten food first", () => {
    const ranked = rankFrequentFoods(
      [
        entry("Toast", "2026-08-20T08:00:00Z"),
        entry("Eggs", "2026-08-20T09:00:00Z"),
        entry("Eggs", "2026-08-21T09:00:00Z"),
        entry("Eggs", "2026-08-22T09:00:00Z"),
      ],
      5,
    );
    expect(ranked[0].name).toBe("Eggs");
    expect(ranked[1].name).toBe("Toast");
  });

  it("breaks ties by recency", () => {
    const ranked = rankFrequentFoods(
      [
        entry("Older", "2026-08-01T08:00:00Z"),
        entry("Newer", "2026-08-25T08:00:00Z"),
      ],
      5,
    );
    expect(ranked[0].name).toBe("Newer");
  });

  /** The chip copies this row, so it must be the newest one, not the first seen. */
  it("carries the id of the most recent occurrence", () => {
    const ranked = rankFrequentFoods(
      [
        entry("Porridge", "2026-08-20T08:00:00Z"),
        entry("Porridge", "2026-08-26T08:00:00Z"),
      ],
      5,
    );
    expect(ranked[0].entryId).toBe("Porridge-2026-08-26T08:00:00Z");
    expect(ranked[0].lastLoggedOn).toBe("2026-08-26");
  });

  it("respects the limit", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      entry(`Food ${i}`, `2026-08-01T0${i % 10}:00:00Z`),
    );
    expect(rankFrequentFoods(many, 8)).toHaveLength(8);
  });

  it("returns nothing for an empty history", () => {
    expect(rankFrequentFoods([], 8)).toEqual([]);
  });
});

describe("date helpers", () => {
  it("adds and subtracts days across a month boundary", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-09-01", -1)).toBe("2026-08-31");
  });

  it("crosses a leap day correctly", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
  });

  it("measures whole days between dates", () => {
    expect(diffDays("2026-08-20", "2026-08-27")).toBe(7);
    expect(diffDays("2026-08-27", "2026-08-27")).toBe(0);
  });

  it("labels days relative to today", () => {
    expect(relativeDayLabel("2026-08-27", "2026-08-27")).toBe("Today");
    expect(relativeDayLabel("2026-08-26", "2026-08-27")).toBe("Yesterday");
    expect(relativeDayLabel("2026-08-24", "2026-08-27")).toBe("3 days ago");
  });

  it("starts weeks on Monday", () => {
    // 2026-08-27 is a Thursday.
    expect(startOfWeek("2026-08-27")).toBe("2026-08-24");
    expect(startOfWeek("2026-08-24")).toBe("2026-08-24");
  });

  it("builds an inclusive window ending today", () => {
    const week = lastNDays("2026-08-27", 7);
    expect(week).toHaveLength(7);
    expect(week[6]).toBe("2026-08-27");
    expect(week[0]).toBe("2026-08-21");
  });

  it("rejects things that are not ISO dates", () => {
    expect(isValidIso("2026-08-27")).toBe(true);
    expect(isValidIso("27/08/2026")).toBe(false);
    expect(isValidIso("")).toBe(false);
    expect(isValidIso(null)).toBe(false);
    expect(isValidIso("2026-13-45")).toBe(false);
  });
});
