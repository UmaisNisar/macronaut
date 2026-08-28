import "server-only";

import { aiGlobalDailyLimit, aiPriorityEmails } from "@/lib/env";
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
  // Rebuilding a whole history is the most expensive thing an account can ask
  // for. A dozen a day is far more than anyone backing up their data needs.
  export: 12,
  // Generous, because a genuine crash loop should still be recorded — just not
  // ten thousand times.
  error: 100,
};

const FRIENDLY: Record<AiKind, string> = {
  food: "food logs",
  photo: "photo logs",
  coach: "coaching notes",
  report: "reports",
  export: "exports",
  error: "error reports",
};

export type BudgetResult =
  | { ok: true; used: number; limit: number }
  | { ok: false; message: string };

/** Kinds that actually reach a model, and so count towards the shared pool. */
const MODEL_KINDS: ReadonlySet<AiKind> = new Set<AiKind>([
  "food",
  "photo",
  "coach",
  "report",
]);

/**
 * Whose calls are served even when the shared pool is gone.
 *
 * A global ceiling turns "a stranger can spend the owner's money" into "a
 * stranger can lock the owner out", which is a worse trade if it is the whole
 * answer. Listing the accounts that must always work removes that: everyone
 * else shares what is left.
 *
 * Matched on email rather than id so it can be set without looking a UUID up
 * in the database, and compared case-insensitively because that is how people
 * type their own address.
 */
function isPriority(email: string | null): boolean {
  if (!email) return false;
  const wanted = email.trim().toLowerCase();
  return aiPriorityEmails.some((e) => e.toLowerCase() === wanted);
}

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
  user: { id: string; email: string | null },
  dateIso: Iso,
  kind: AiKind,
): Promise<BudgetResult> {
  const limit = AI_DAILY_LIMITS[kind];

  let counts: { user: number; global: number };
  try {
    counts = await store.bumpAiUsage(user.id, dateIso, kind);
  } catch (error) {
    // Never let the meter itself break logging. Failing open is the right call
    // for a personal app: a broken counter should not stop you eating.
    console.warn("[macronaut] could not record AI usage, allowing anyway:", error);
    return { ok: true, used: 0, limit };
  }

  if (counts.user > limit) {
    return {
      ok: false,
      message: `That is ${limit} ${FRIENDLY[kind]} today, which is the daily limit. It resets tomorrow.`,
    };
  }

  /*
   * The shared ceiling, checked second so a person who is over their own
   * allowance is told that rather than being blamed for everyone else.
   *
   * Refusing here is not a dead end: food falls through to the built-in
   * estimator and coaching to templates, so the app keeps working — it just
   * stops being clever until tomorrow.
   */
  if (
    MODEL_KINDS.has(kind) &&
    counts.global > aiGlobalDailyLimit &&
    !isPriority(user.email)
  ) {
    return {
      ok: false,
      message:
        "Macronaut has used up its shared AI allowance for today. Your meal " +
        "still gets logged from the built-in estimates, and the model is back " +
        "tomorrow.",
    };
  }

  return { ok: true, used: counts.user, limit };
}
