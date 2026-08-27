import "server-only";

import type { AiKind, DataStore } from "@/lib/db/store";
import type { Iso } from "@/lib/date";

/**
 * A daily ceiling on model calls, per account.
 *
 * Signups are open, so anyone who finds the URL can create an account and start
 * spending the project owner's Gemini quota. Row-level security already stops
 * them seeing anyone else's data; this stops them running up a bill.
 *
 * The numbers are set well above real use — logging fifteen things a day and
 * photographing five of them stays comfortably inside them — so a person who
 * hits one of these is either automating something or having a very unusual
 * day. Photos are capped harder because an image costs far more than a
 * sentence.
 */
export const AI_DAILY_LIMITS: Record<AiKind, number> = {
  food: 80,
  photo: 25,
  coach: 40,
  report: 10,
};

const FRIENDLY: Record<AiKind, string> = {
  food: "food logs",
  photo: "photo logs",
  coach: "coaching notes",
  report: "reports",
};

export type BudgetResult =
  | { ok: true; used: number; limit: number }
  | { ok: false; message: string };

/**
 * Record one call and say whether it was within budget.
 *
 * Counted before the model runs, not after, so a failing or slow call cannot be
 * retried indefinitely for free. The counter is incremented atomically by the
 * store; checking first and writing after would let two concurrent requests
 * both pass the check.
 */
export async function consumeAiBudget(
  store: DataStore,
  userId: string,
  dateIso: Iso,
  kind: AiKind,
): Promise<BudgetResult> {
  const limit = AI_DAILY_LIMITS[kind];

  let used: number;
  try {
    used = await store.bumpAiUsage(userId, dateIso, kind);
  } catch (error) {
    // Never let the meter itself break logging. Failing open is the right call
    // for a personal app: a broken counter should not stop you eating.
    console.warn("[macronaut] could not record AI usage, allowing anyway:", error);
    return { ok: true, used: 0, limit };
  }

  if (used > limit) {
    return {
      ok: false,
      message: `That is ${limit} ${FRIENDLY[kind]} today, which is the daily limit. It resets tomorrow.`,
    };
  }

  return { ok: true, used, limit };
}
