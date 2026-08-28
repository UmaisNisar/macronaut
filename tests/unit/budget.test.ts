import { afterEach, describe, expect, it, vi } from "vitest";

import { AI_DAILY_LIMITS, consumeAiBudget } from "@/lib/ai/budget";
import type { AiKind, DataStore } from "@/lib/db/store";
import { aiGlobalDailyLimit } from "@/lib/env";

/**
 * The rate limiter is the only thing standing between an open signup page and
 * an unbounded Gemini bill, so its edges matter more than its happy path.
 */

const MODEL_KINDS = ["food", "photo", "coach", "report"];

/**
 * A store that just counts, standing in for the atomic SQL increment.
 *
 * Keys are per kind, and the global figure is the sum of the ones that reach
 * a model — the same rule the SQL function applies, so a divergence between
 * them would show up here.
 */
function countingStore(
  start: Record<string, number> = {},
  /** Model calls already made today by *other* accounts. */
  elsewhere = 0,
) {
  const counts: Record<string, number> = { ...start };
  const store = {
    bumpAiUsage: vi.fn(async (_userId: string, dateIso: string, kind: AiKind) => {
      const key = `${dateIso}:${kind}`;
      counts[key] = (counts[key] ?? 0) + 1;
      return {
        user: counts[key],
        global: Object.entries(counts)
          .filter(([k]) => k.startsWith(`${dateIso}:`))
          .filter(([k]) => MODEL_KINDS.includes(k.split(":")[1]))
          .reduce((a, [, v]) => a + v, elsewhere),
      };
    }),
  } as unknown as DataStore;
  return { store, counts };
}

/** The signed-in person, as the budget sees them. */
const someone = { id: "u", email: "someone@example.com" };

describe("consumeAiBudget", () => {
  it("allows calls below the limit and reports usage", async () => {
    const { store } = countingStore();
    const r = await consumeAiBudget(store, someone, "2026-08-28", "food");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.used).toBe(1);
      expect(r.limit).toBe(AI_DAILY_LIMITS.food);
    }
  });

  it("allows exactly the limit, and refuses the one after", async () => {
    const limit = AI_DAILY_LIMITS.photo;
    const { store } = countingStore({ [`2026-08-28:photo`]: limit - 1 });

    const atLimit = await consumeAiBudget(store, someone, "2026-08-28", "photo");
    expect(atLimit.ok).toBe(true);

    const overLimit = await consumeAiBudget(store, someone, "2026-08-28", "photo");
    expect(overLimit.ok).toBe(false);
    if (!overLimit.ok) {
      expect(overLimit.message).toContain(String(limit));
    }
  });

  it("counts each kind separately, so photos cannot exhaust text logging", async () => {
    const { store } = countingStore({
      [`2026-08-28:photo`]: AI_DAILY_LIMITS.photo + 5,
    });
    const food = await consumeAiBudget(store, someone, "2026-08-28", "food");
    expect(food.ok).toBe(true);
  });

  it("resets on a new day", async () => {
    const { store } = countingStore({
      [`2026-08-28:food`]: AI_DAILY_LIMITS.food + 10,
    });
    const tomorrow = await consumeAiBudget(store, someone, "2026-08-29", "food");
    expect(tomorrow.ok).toBe(true);
  });

  it("charges before the model runs, so retries cannot be free", async () => {
    const { store } = countingStore();
    await consumeAiBudget(store, someone, "2026-08-28", "food");
    await consumeAiBudget(store, someone, "2026-08-28", "food");
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

    const r = await consumeAiBudget(broken, someone, "2026-08-28", "food");
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

/**
 * The shared ceiling is what bounds the whole service, and it has two ways to
 * be wrong: too loose and it does nothing, too strict and a stranger can lock
 * the owner out by spending it.
 */
describe("the shared daily ceiling", () => {
  const stranger = { id: "other", email: "stranger@example.com" };

  it("refuses a model call once the pool is gone, whoever asks", async () => {
    const { store } = countingStore({}, aiGlobalDailyLimit + 5);

    const r = await consumeAiBudget(store, stranger, "2026-08-28", "food");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/shared AI allowance/i);
  });

  /**
   * Loaded fresh with the allowlist set, because both the ceiling and the
   * allowlist are read from the environment when the module first loads.
   */
  async function withAllowlist(list: string) {
    vi.resetModules();
    vi.stubEnv("MACRONAUT_AI_PRIORITY_EMAILS", list);
    const budget = await import("@/lib/ai/budget");
    const env = await import("@/lib/env");
    return { consume: budget.consumeAiBudget, limit: env.aiGlobalDailyLimit };
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("still serves a priority account, so the pool cannot be used to lock them out", async () => {
    const { consume, limit } = await withAllowlist("owner@example.com");
    const { store } = countingStore({}, limit + 5);

    const r = await consume(
      store,
      // Typed the way a person types their own address, not the way it was
      // configured.
      { id: "owner", email: "OWNER@Example.com " },
      "2026-08-28",
      "food",
    );
    expect(r.ok).toBe(true);
  });

  it("does not extend that to everyone else", async () => {
    const { consume, limit } = await withAllowlist("owner@example.com");
    const { store } = countingStore({}, limit + 5);

    const r = await consume(store, stranger, "2026-08-28", "food");
    expect(r.ok).toBe(false);
  });

  it("treats an account with no email as ordinary rather than privileged", async () => {
    const { consume, limit } = await withAllowlist("owner@example.com");
    const { store } = countingStore({}, limit + 5);

    const r = await consume(store, { id: "solo", email: null }, "2026-08-28", "food");
    expect(r.ok).toBe(false);
  });

  it("does not spend the shared pool on things that never reach a model", async () => {
    // Deliberately seeded on this account: export and error are capped per
    // person too, and neither should touch the shared pool.
    const { store } = countingStore({
      "2026-08-28:export": 1,
      "2026-08-28:error": 1,
    });

    const r = await consumeAiBudget(store, stranger, "2026-08-28", "food");
    expect(r.ok).toBe(true);
  });

  it("blocks the shared pool before the model runs, not after", async () => {
    const { store } = countingStore({}, aiGlobalDailyLimit);

    // The increment takes it one past the ceiling, so this call is the one
    // that gets refused rather than the one after it.
    const r = await consumeAiBudget(store, stranger, "2026-08-28", "coach");
    expect(r.ok).toBe(false);
  });

  it("tells someone over their own allowance that, not that the pool is dry", async () => {
    const { store } = countingStore({
      "2026-08-28:photo": AI_DAILY_LIMITS.photo + 1,
    });

    const r = await consumeAiBudget(store, stranger, "2026-08-28", "photo");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain(String(AI_DAILY_LIMITS.photo));
  });
});
