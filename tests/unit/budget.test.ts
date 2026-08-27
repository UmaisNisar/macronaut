import { describe, expect, it, vi } from "vitest";

import { AI_DAILY_LIMITS, consumeAiBudget } from "@/lib/ai/budget";
import type { AiKind, DataStore } from "@/lib/db/store";

/**
 * The rate limiter is the only thing standing between an open signup page and
 * an unbounded Gemini bill, so its edges matter more than its happy path.
 */

/** A store that just counts, standing in for the atomic SQL increment. */
function countingStore(start: Record<string, number> = {}) {
  const counts: Record<string, number> = { ...start };
  const store = {
    bumpAiUsage: vi.fn(async (_userId: string, dateIso: string, kind: AiKind) => {
      const key = `${dateIso}:${kind}`;
      counts[key] = (counts[key] ?? 0) + 1;
      return counts[key];
    }),
  } as unknown as DataStore;
  return { store, counts };
}

describe("consumeAiBudget", () => {
  it("allows calls below the limit and reports usage", async () => {
    const { store } = countingStore();
    const r = await consumeAiBudget(store, "u", "2026-08-28", "food");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.used).toBe(1);
      expect(r.limit).toBe(AI_DAILY_LIMITS.food);
    }
  });

  it("allows exactly the limit, and refuses the one after", async () => {
    const limit = AI_DAILY_LIMITS.photo;
    const { store } = countingStore({ [`2026-08-28:photo`]: limit - 1 });

    const atLimit = await consumeAiBudget(store, "u", "2026-08-28", "photo");
    expect(atLimit.ok).toBe(true);

    const overLimit = await consumeAiBudget(store, "u", "2026-08-28", "photo");
    expect(overLimit.ok).toBe(false);
    if (!overLimit.ok) {
      expect(overLimit.message).toContain(String(limit));
    }
  });

  it("counts each kind separately, so photos cannot exhaust text logging", async () => {
    const { store } = countingStore({
      [`2026-08-28:photo`]: AI_DAILY_LIMITS.photo + 5,
    });
    const food = await consumeAiBudget(store, "u", "2026-08-28", "food");
    expect(food.ok).toBe(true);
  });

  it("resets on a new day", async () => {
    const { store } = countingStore({
      [`2026-08-28:food`]: AI_DAILY_LIMITS.food + 10,
    });
    const tomorrow = await consumeAiBudget(store, "u", "2026-08-29", "food");
    expect(tomorrow.ok).toBe(true);
  });

  it("charges before the model runs, so retries cannot be free", async () => {
    const { store } = countingStore();
    await consumeAiBudget(store, "u", "2026-08-28", "food");
    await consumeAiBudget(store, "u", "2026-08-28", "food");
    expect(store.bumpAiUsage).toHaveBeenCalledTimes(2);
  });

  /**
   * A broken counter must not stop someone logging their dinner. Failing open
   * is the deliberate choice for a personal app; the alternative is an outage
   * caused by the thing that was only ever meant to be a cost guard.
   */
  it("fails open if the counter itself errors", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const broken = {
      bumpAiUsage: vi.fn(async () => {
        throw new Error("database on fire");
      }),
    } as unknown as DataStore;

    const r = await consumeAiBudget(broken, "u", "2026-08-28", "food");
    expect(r.ok).toBe(true);
    // But it must be loud about it rather than hiding a broken guard.
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("has a limit defined for every kind it can be called with", () => {
    const kinds: AiKind[] = ["food", "photo", "coach", "report"];
    for (const kind of kinds) {
      expect(AI_DAILY_LIMITS[kind]).toBeGreaterThan(0);
    }
  });

  it("caps photos harder than text, since an image costs more", () => {
    expect(AI_DAILY_LIMITS.photo).toBeLessThan(AI_DAILY_LIMITS.food);
  });
});
