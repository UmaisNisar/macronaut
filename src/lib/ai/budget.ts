import "server-only";

import { aiGlobalDailyLimit } from "@/lib/env";
import { isPriority, type AiAccess } from "@/lib/ai/access";
import type { AiKind, DataStore } from "@/lib/db/store";
import type { Iso } from "@/lib/date";

/**
 * A daily ceiling on model calls, per account.
 *
 * Most calls now go out on the person's own Gemini key, so this is less about
 * money than about the deployment itself: every call still holds a function
 * and writes rows, and signups are open.
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
  // A person checks their key once or twice. Anyone checking dozens is
  // testing keys that are not theirs.
  key: 10,
};

const FRIENDLY: Record<AiKind, string> = {
  food: "food logs",
  photo: "photo logs",
  coach: "coaching notes",
  report: "reports",
  export: "exports",
  error: "error reports",
  key: "key checks",
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
  /** Which key the call will go out on; only the server's is pooled. */
  keySource: AiAccess["source"] = "server",
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
   * allowance is told that rather than being blamed for everyone else. It
   * only guards the server's key: a call on someone's own key spends nothing
   * of the owner's.
   *
   * Refusing here is not a dead end: food falls through to the built-in
   * estimator and coaching to templates, so the app keeps working — it just
   * stops being clever until tomorrow.
   */
  if (
    keySource === "server" &&
    MODEL_KINDS.has(kind) &&
    counts.global > aiGlobalDailyLimit &&
    !isPriority(user.email)
  ) {
    return {
      ok: false,
      message:
        "Macronaut has used up its shared AI allowance for today. Add your " +
        "own free Gemini key in You to keep going, or try again tomorrow.",
    };
  }

  return { ok: true, used: counts.user, limit };
}
