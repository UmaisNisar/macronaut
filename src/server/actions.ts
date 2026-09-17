"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  CredentialsInput,
  EditFoodInput,
  CheckFoodInput,
  CheckedFoodItem,
  LogCheckedFoodInput,
  RepeatFoodInput,
  SwapFoodInput,
  UndoLogInput,
  LogBarcodeInput,
  PushSubscriptionInput,
  ReminderSettingsInput,
  LogFoodPhotoInput,
  LogFoodInput,
  LogWeightInput,
  OnboardingInput,
  ProfileUpdateInput,
  ReportPeriod,
  type AiCoachNote,
  type AiPeriodReport,
  type AiWeightNote,
  type DailyLog,
  type FoodEntry,
  type Profile,
} from "@/lib/schemas";
import { getSession, getStore } from "@/lib/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import {
  addDays,
  isValidIso,
  type Iso,
  relativeDayLabel,
} from "@/lib/date";
import { userToday } from "@/lib/server-date";
import { computeJourney, computeTargets, round } from "@/lib/nutrition";
import { computeStreaks, weightBefore, weightStats } from "@/lib/insights";
import { analyseFood, analyseFoodPhoto } from "@/lib/ai/food";
import { consumeAiBudget } from "@/lib/ai/budget";
import { portionThatFits, verdictFor, type Verdict } from "@/lib/verdict";
import { foodKey } from "@/lib/db/store";
import { resolveFoodEmoji } from "@/lib/food-emoji";
import { lookupBarcode } from "@/lib/ai/barcode";
import type { DataStore } from "@/lib/db/store";
import type { AiFoodItem } from "@/lib/schemas";
import { resolveAiAccess, type AiAccess } from "@/lib/ai/access";
import { checkGeminiKey } from "@/lib/ai/gemini";
import { canStoreKeys, keyHint, sealKey } from "@/lib/ai/key-vault";
import {
  writeDailyNote,
  writeWeightNote,
} from "@/lib/ai/coach";
import {
  coachSignature,
  emptyDay,
  recomputeDay,
  refreshAchievements,
  targetsForDate,
  buildPeriodReport,  readCachedReport,
} from "@/server/core";
import { ACHIEVEMENT_BY_KEY } from "@/lib/achievements";

export type ActionResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const fail = (error: string, fieldErrors?: Record<string, string>) =>
  ({ ok: false as const, error, fieldErrors });

function zodFieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

const APP_PATHS = ["/today", "/history", "/progress", "/insights", "/profile"];
function revalidateApp() {
  for (const path of APP_PATHS) revalidatePath(path);
}

/** Session + profile, or a typed failure the client can show. */
async function withProfile(): Promise<
  | { ok: true; profile: Profile; store: Awaited<ReturnType<typeof getStore>> }
  | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Your session expired. Sign in again." };
  const store = await getStore();
  const profile = await store.getProfile(session.userId);
  if (!profile) return { ok: false, error: "Finish onboarding first." };
  return { ok: true, profile, store };
}

/** Whose key a call goes out on, for the person already loaded. */
function aiAccess(ctx: { profile: Profile; store: DataStore }): Promise<AiAccess> {
  return resolveAiAccess(ctx.store, {
    id: ctx.profile.id,
    email: ctx.profile.email,
  });
}

async function safeDate(value: unknown): Promise<Iso> {
  return isValidIso(value) ? value : await userToday();
}

/* ================================================================== */
/* Onboarding + profile                                                */
/* ================================================================== */

export async function completeOnboardingAction(
  raw: unknown,
): Promise<ActionResult<{ profile: Profile }>> {
  const session = await getSession();
  if (!session) return fail("Sign in to create your profile.");

  const parsed = OnboardingInput.safeParse(raw);
  if (!parsed.success) {
    return fail(
      "Some details need another look.",
      zodFieldErrors(parsed.error.issues),
    );
  }

  const input = parsed.data;
  const store = await getStore();
  const today = await userToday();

  const targets = computeTargets({
    age: input.age,
    gender: input.gender,
    heightCm: input.heightCm,
    weightKg: input.currentWeightKg,
    targetWeightKg: input.targetWeightKg,
    weeklyLossKg: input.weeklyLossKg,
    activityLevel: input.activityLevel,
  });

  const existing = await store.getProfile(session.userId);

  const profile = await store.saveProfile({
    id: session.userId,
    email: session.email,
    displayName: input.displayName ?? existing?.displayName ?? null,
    age: input.age,
    gender: input.gender,
    heightCm: input.heightCm,
    // Starting weight is set once — it anchors the whole journey.
    startingWeightKg: existing?.startingWeightKg ?? input.currentWeightKg,
    currentWeightKg: input.currentWeightKg,
    targetWeightKg: input.targetWeightKg,
    weeklyLossKg: input.weeklyLossKg,
    activityLevel: input.activityLevel,
    units: input.units,
    onboardedAt: existing?.onboardedAt ?? new Date().toISOString(),
    reminderHour: null,
    timeZone: null,
  });

  await store.insertGoalSnapshot({
    userId: profile.id,
    effectiveFrom: today,
    age: input.age,
    gender: input.gender,
    heightCm: input.heightCm,
    weightKg: input.currentWeightKg,
    targetWeightKg: input.targetWeightKg,
    weeklyLossKg: input.weeklyLossKg,
    activityLevel: input.activityLevel,
    targets,
  });

  const weights = await store.listWeightLogs(profile.id);
  if (!weights.length) {
    await store.upsertWeightLog(profile.id, today, input.currentWeightKg, null);
  }

  await refreshAchievements(store, profile, today);
  revalidateApp();

  return { ok: true, profile };
}

export async function updateGoalsAction(
  raw: unknown,
): Promise<ActionResult<{ profile: Profile }>> {
  const ctx = await withProfile();
  if (!ctx.ok) return fail(ctx.error);

  const parsed = ProfileUpdateInput.safeParse(raw);
  if (!parsed.success) {
    return fail("Check those numbers.", zodFieldErrors(parsed.error.issues));
  }

  const { profile, store } = ctx;
  const next = { ...profile, ...parsed.data };

  if (next.targetWeightKg > next.currentWeightKg + 0.001) {
    return fail("Target weight cannot be above your current weight.", {
      targetWeightKg: "Set a target at or below your current weight.",
    });
  }

  const updated = await store.patchProfile(profile.id, {
    displayName: next.displayName ?? profile.displayName,
    age: next.age,
    gender: next.gender,
    heightCm: next.heightCm,
    currentWeightKg: next.currentWeightKg,
    targetWeightKg: next.targetWeightKg,
    weeklyLossKg: next.weeklyLossKg,
    activityLevel: next.activityLevel,
    units: next.units,
  });

  const today = await userToday();
  const targets = computeTargets({
    age: updated.age,
    gender: updated.gender,
    heightCm: updated.heightCm,
    weightKg: updated.currentWeightKg,
    targetWeightKg: updated.targetWeightKg,
    weeklyLossKg: updated.weeklyLossKg,
    activityLevel: updated.activityLevel,
  });

  await store.insertGoalSnapshot({
    userId: updated.id,
    effectiveFrom: today,
    age: updated.age,
    gender: updated.gender,
    heightCm: updated.heightCm,
    weightKg: updated.currentWeightKg,
    targetWeightKg: updated.targetWeightKg,
    weeklyLossKg: updated.weeklyLossKg,
    activityLevel: updated.activityLevel,
    targets,
  });

  // Only today forward is re-scored; past days keep the plan they were judged against.
  await recomputeDay(store, updated.id, today, targets);
  revalidateApp();

  return { ok: true, profile: updated };
}

/* ================================================================== */
/* Food                                                                */
/* ================================================================== */

export type LogFoodPayload = {
  day: DailyLog;
  entries: FoodEntry[];
  added: FoodEntry[];
  assumptions: string[];
  source: "ai" | "estimator";
  /**
   * Why an estimate was used, when it was: no key saved, or Google refusing
   * the one that is. Lets the composer point at the fix instead of shrugging.
   */
  keyIssue: "missing" | "refused" | null;
  unlocked: { key: string; name: string; emoji: string }[];
};

/**
 * Replace the model's guess with what this person has already told us.
 *
 * Only fires on an exact name match, which is conservative on purpose: it is
 * better to leave an estimate alone than to apply someone's homemade-porridge
 * numbers to a cafe one just because both contain the word.
 */
async function applyCorrections(
  store: DataStore,
  userId: string,
  foods: AiFoodItem[],
): Promise<{ foods: AiFoodItem[]; notes: string[] }> {
  let corrections;
  try {
    corrections = await store.listFoodCorrections(userId);
  } catch (error) {
    console.warn("[macronaut] could not load corrections:", error);
    return { foods, notes: [] };
  }
  if (!corrections.length) return { foods, notes: [] };

  const byKey = new Map(corrections.map((c) => [c.nameKey, c]));
  const notes: string[] = [];

  const applied = foods.map((food) => {
    const match = byKey.get(foodKey(food.name));
    if (!match) return food;
    notes.push(`Used your saved numbers for ${match.name}.`);
    return {
      ...food,
      calories: match.calories,
      protein: match.protein,
      carbs: match.carbs,
      fat: match.fat,
      fiber: match.fiber,
      sugar: match.sugar,
      confidence: "high" as const,
    };
  });

  return { foods: applied, notes };
}

/**
 * Saving a meal must not take the whole screen down.
 *
 * Twice in the log a Supabase insert came back `Gateway Timeout`, the store
 * threw, the throw escaped the Server Action, and the route error boundary
 * replaced Today with the error page — for a meal that was still sitting in
 * the composer, one tap from working. The client had already reported it as
 * React #441 two seconds earlier: the same incident, seen from the browser.
 *
 * A failed write is turned into an ordinary `{ ok: false }` instead, which
 * the composer shows as a toast and, importantly, leaves the typed text
 * where it is.
 *
 * Not retried here, deliberately. A 504 means the gateway stopped waiting,
 * not that the database stopped working, so the row may exist; replaying it
 * would serve someone two dinners. Reads retry at the fetch layer, where
 * replaying is free. See lib/supabase/resilient-fetch.
 */
/** What the composer shows when a save is refused. Kept in one place so the
 *  six places that write food cannot drift into six different apologies. */
const SAVE_FAILED =
  "That did not save — the database took too long to answer. Your text is still here, so try again.";

/**
 * Returns null instead of throwing, so callers must decide.
 *
 * Deliberately not a thrown error: a throw out of a Server Action reaches the
 * route error boundary, and that is the bug being fixed. `null` makes the type
 * checker point at every place that writes food and demand an answer.
 */
async function saveEntries(
  store: DataStore,
  userId: string,
  rows: Parameters<DataStore["insertFoodEntries"]>[0],
) {
  try {
    return await store.insertFoodEntries(rows);
  } catch (error) {
    // onRequestError will not see this now that it is caught, so log it here
    // or the next occurrence becomes invisible.
    await store
      .recordError(userId, {
        source: "server",
        kind: "action",
        message: `save food: ${error instanceof Error ? error.message : String(error)}`,
        detail: error instanceof Error ? (error.stack ?? null) : null,
        path: "/today",
      })
      .catch(() => {});
    return null;
  }
}

export async function logFoodAction(
  raw: unknown,
): Promise<ActionResult<LogFoodPayload>> {
  const ctx = await withProfile();
  if (!ctx.ok) return fail(ctx.error);

  const parsed = LogFoodInput.safeParse(raw);
  if (!parsed.success) {
    return fail(
      parsed.error.issues[0]?.message ?? "That input could not be read.",
    );
  }

  const { profile, store } = ctx;
  const { text, date } = parsed.data;

  const ai = await aiAccess(ctx);
  const budget = await consumeAiBudget(
    store,
    { id: profile.id, email: profile.email },
    await userToday(),
    "food",
    ai.source,
  );
  if (!budget.ok) return fail(budget.message);

  const { analysis, source, fallbackReason, keyRefused } = await analyseFood(
    text,
    ai.apiKey,
  );

  // Falling back is by design, but when there IS a key it means the model
  // call actually failed — the exact silent degradation that used to be
  // invisible outside a development console.
  if (source === "estimator" && ai.apiKey) {
    void store.recordError(profile.id, {
      source: "server",
      kind: "ai-fallback",
      message: "Food analysis fell back to the offline estimator",
      detail: fallbackReason ?? null,
      path: "/today",
    });
  }

  // Keep genuinely zero-calorie items — a logged Coke Zero or black coffee is
  // still information the user typed and expects to see. Only the model's
  // explicit "nothing here" sentinel gets dropped.
  const usable = analysis.foods.filter(
    (f) => !/^nothing/i.test(f.name.trim()),
  );
  if (!usable.length) {
    return fail(
      "No food could be identified in that. Try naming the dish and rough amount.",
    );
  }

  const learned = await applyCorrections(store, profile.id, usable);

  const added = await saveEntries(store, profile.id, 
    learned.foods.map((f) => ({
      userId: profile.id,
      logDate: date,
      meal: f.meal,
      name: f.name,
      quantity: f.estimatedQuantity,
      emoji: resolveFoodEmoji(f.name, f.emoji),
      calories: round(f.calories),
      protein: round(f.protein, 1),
      carbs: round(f.carbs, 1),
      fat: round(f.fat, 1),
      fiber: round(f.fiber, 1),
      sugar: round(f.sugar, 1),
      confidence: f.confidence,
      // This item's own assumptions first. Anything the model put at the
      // top level applies to the whole entry, so it follows.
      assumptions: [...f.assumptions, ...analysis.assumptions, ...learned.notes],
      alternatives: f.alternatives,
      rawInput: text,
      source: source === "ai" ? "ai" : "estimator",
    })),
  );

  // A refused write must not reach the route error boundary; the
  // composer shows this and keeps what was typed.
  if (!added) return fail(SAVE_FAILED);

  const goals = await store.listGoalSnapshots(profile.id);
  const day = await recomputeDay(
    store,
    profile.id,
    date,
    targetsForDate(goals, profile, date),
  );
  const entries = await store.listFoodEntries(profile.id, date, date);
  const unlockedKeys = await refreshAchievements(store, profile, await userToday());

  revalidateApp();

  return {
    ok: true,
    day,
    entries,
    added,
    assumptions: analysis.assumptions,
    source,
    keyIssue: !ai.apiKey ? "missing" : keyRefused ? "refused" : null,
    unlocked: unlockedKeys.flatMap((key) => {
      const def = ACHIEVEMENT_BY_KEY.get(key);
      return def ? [{ key, name: def.name, emoji: def.emoji }] : [];
    }),
  };
}

/**
 * Log something you have eaten before, by copying an entry you already own.
 *
 * Deliberately no model call: the numbers were already estimated once, so
 * repeating breakfast should be instant and free rather than another three
 * second round trip to Gemini for the same answer. The source row is re-read
 * server-side rather than trusted from the client, so this cannot be used to
 * invent arbitrary macros.
 */
/**
 * Log a meal from a photograph.
 *
 * The image never touches our storage: it goes to the model, produces numbers,
 * and is dropped. Nothing about tracking your lunch requires us to keep a
 * picture of it.
 */
export async function logFoodPhotoAction(
  raw: unknown,
): Promise<ActionResult<LogFoodPayload>> {
  const ctx = await withProfile();
  if (!ctx.ok) return fail(ctx.error);

  const parsed = LogFoodPhotoInput.safeParse(raw);
  if (!parsed.success) {
    return fail(
      parsed.error.issues[0]?.message ?? "That photo could not be read.",
    );
  }

  const { profile, store } = ctx;
  const { imageBase64, mimeType, date, note } = parsed.data;

  const ai = await aiAccess(ctx);
  // Nothing to meter when there is nothing to call.
  if (!ai.apiKey) {
    return fail("Reading photos needs a Gemini key. Add your free one in You.");
  }

  const budget = await consumeAiBudget(
    store,
    { id: profile.id, email: profile.email },
    await userToday(),
    "photo",
    ai.source,
  );
  if (!budget.ok) return fail(budget.message);

  const read = await analyseFoodPhoto(
    { data: imageBase64, mimeType },
    note,
    ai.apiKey,
  );
  if (!read.ok) {
    void store.recordError(profile.id, {
      source: "server",
      kind: "ai-photo-failed",
      message: read.reason,
      path: "/today",
    });
    return fail(read.reason);
  }

  const usable = read.analysis.foods.filter(
    (f) => !/^nothing/i.test(f.name.trim()),
  );
  if (!usable.length) {
    return fail(
      "No food could be picked out of that photo. Try a clearer shot, or type it instead.",
    );
  }

  const added = await saveEntries(store, profile.id, 
    usable.map((f) => ({
      userId: profile.id,
      logDate: date,
      meal: f.meal,
      name: f.name,
      quantity: f.estimatedQuantity,
      emoji: resolveFoodEmoji(f.name, f.emoji),
      calories: round(f.calories),
      protein: round(f.protein, 1),
      carbs: round(f.carbs, 1),
      fat: round(f.fat, 1),
      fiber: round(f.fiber, 1),
      sugar: round(f.sugar, 1),
      confidence: f.confidence,
      assumptions: [...f.assumptions, ...read.analysis.assumptions],
      alternatives: f.alternatives,
      rawInput: note?.trim() ? "photo: " + note.trim() : "photo",
      source: "ai",
    })),
  );

  // A refused write must not reach the route error boundary; the
  // composer shows this and keeps what was typed.
  if (!added) return fail(SAVE_FAILED);

  const goals = await store.listGoalSnapshots(profile.id);
  const day = await recomputeDay(
    store,
    profile.id,
    date,
    targetsForDate(goals, profile, date),
  );
  const entries = await store.listFoodEntries(profile.id, date, date);
  const unlockedKeys = await refreshAchievements(
    store,
    profile,
    await userToday(),
  );

  revalidateApp();

  return {
    ok: true,
    day,
    entries,
    added,
    assumptions: read.analysis.assumptions,
    source: "ai",
    keyIssue: null,
    unlocked: unlockedKeys.flatMap((key) => {
      const def = ACHIEVEMENT_BY_KEY.get(key);
      return def ? [{ key, name: def.name, emoji: def.emoji }] : [];
    }),
  };
}

/**
 * Log a packaged food by its barcode.
 *
 * No model call at all: the numbers come off the manufacturer's label, so this
 * is both free and more accurate than anything an estimate could produce. It
 * still respects the daily food budget so the lookup cannot be hammered.
 */
export async function logBarcodeAction(
  raw: unknown,
): Promise<ActionResult<{ day: DailyLog; entries: FoodEntry[]; added: FoodEntry[] }>> {
  const ctx = await withProfile();
  if (!ctx.ok) return fail(ctx.error);

  const parsed = LogBarcodeInput.safeParse(raw);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "That barcode could not be read.");
  }

  const { profile, store } = ctx;
  const { code, date } = parsed.data;

  const budget = await consumeAiBudget(
    store,
    { id: profile.id, email: profile.email },
    await userToday(),
    "food",
  );
  if (!budget.ok) return fail(budget.message);

  const found = await lookupBarcode(code);
  if (!found.ok) return fail(found.reason);

  const f = found.food;
  const learned = await applyCorrections(store, profile.id, [f]);

  const added = await saveEntries(store, profile.id, 
    learned.foods.map((item) => ({
      userId: profile.id,
      logDate: date,
      meal: parsed.data.meal ?? item.meal,
      name: item.name,
      quantity: item.estimatedQuantity,
      emoji: resolveFoodEmoji(item.name, item.emoji),
      calories: round(item.calories),
      protein: round(item.protein, 1),
      carbs: round(item.carbs, 1),
      fat: round(item.fat, 1),
      fiber: round(item.fiber, 1),
      sugar: round(item.sugar, 1),
      confidence: item.confidence,
      assumptions: [
        "Nutrition read from the product label via Open Food Facts.",
        ...learned.notes,
      ],
      alternatives: [],
      rawInput: `barcode ${code}`,
      source: "manual",
    })),
  );

  // A refused write must not reach the route error boundary; the
  // composer shows this and keeps what was typed.
  if (!added) return fail(SAVE_FAILED);

  const goals = await store.listGoalSnapshots(profile.id);
  const day = await recomputeDay(
    store,
    profile.id,
    date,
    targetsForDate(goals, profile, date),
  );
  const entries = await store.listFoodEntries(profile.id, date, date);
  await refreshAchievements(store, profile, await userToday());

  revalidateApp();
  return { ok: true, day, entries, added };
}

/** Store a device's push subscription and, with it, turn reminders on. */
export async function savePushSubscriptionAction(
  raw: unknown,
): Promise<ActionResult<{ done: true }>> {
  const ctx = await withProfile();
  if (!ctx.ok) return fail(ctx.error);

  const parsed = PushSubscriptionInput.safeParse(raw);
  if (!parsed.success) return fail("That subscription could not be read.");

  await ctx.store.savePushSubscription(ctx.profile.id, parsed.data);
  return { ok: true, done: true };
}

export async function removePushSubscriptionAction(
  endpoint: string,
): Promise<ActionResult<{ done: true }>> {
  const ctx = await withProfile();
  if (!ctx.ok) return fail(ctx.error);
  if (typeof endpoint !== "string" || !endpoint) return fail("Nothing to remove.");

  await ctx.store.deletePushSubscription(endpoint);
  return { ok: true, done: true };
}

/**
 * When to nudge, in the person's own hours.
 *
 * The time zone rides along because a cron job running in UTC has no other way
 * to know when 8pm is for them.
 */
export async function saveReminderSettingsAction(
  raw: unknown,
): Promise<ActionResult<{ done: true }>> {
  const ctx = await withProfile();
  if (!ctx.ok) return fail(ctx.error);

  const parsed = ReminderSettingsInput.safeParse(raw);
  if (!parsed.success) return fail("Pick an hour between 0 and 23.");

  await ctx.store.patchProfile(ctx.profile.id, {
    reminderHour: parsed.data.reminderHour,
    ...(parsed.data.timeZone ? { timeZone: parsed.data.timeZone } : {}),
  });

  revalidateApp();
  return { ok: true, done: true };
}

/** Search your own food history by name. */
export async function searchFoodAction(
  query: unknown,
): Promise<ActionResult<{ entries: FoodEntry[] }>> {
  const ctx = await withProfile();
  if (!ctx.ok) return fail(ctx.error);

  const term = typeof query === "string" ? query.trim().slice(0, 60) : "";
  if (term.length < 2) return fail("Type at least two characters.");

  const entries = await ctx.store.searchFoodEntries(ctx.profile.id, term, 25);
  return { ok: true, entries };
}

/**
 * Ask the model to have another go at an entry the estimator guessed.
 *
 * When the AI is unreachable a log still succeeds, but from a keyword match.
 * Once it is reachable again there was no way to upgrade that guess short of
 * deleting the entry and retyping it, which loses the meal's place in the day.
 *
 * The item is re-described to the model on its own — name and quantity, plus
 * the original wording as context — rather than re-running the whole original
 * input. One item goes in and one comes out, so the replacement is predictable
 * even when the original sentence contained several foods.
 */
export async function reanalyseFoodAction(
  entryId: unknown,
): Promise<ActionResult<{ day: DailyLog; entries: FoodEntry[]; entry: FoodEntry }>> {
  const ctx = await withProfile();
  if (!ctx.ok) return fail(ctx.error);
  if (typeof entryId !== "string" || !entryId) return fail("Nothing to redo.");

  const { profile, store } = ctx;
  const existing = await store.getFoodEntry(profile.id, entryId);
  if (!existing) return fail("That entry no longer exists.");

  const ai = await aiAccess(ctx);
  if (!ai.apiKey) {
    return fail(
      "A better reading needs a Gemini key. Add your free one in You, then try again.",
    );
  }

  const budget = await consumeAiBudget(
    store,
    { id: profile.id, email: profile.email },
    await userToday(),
    "food",
    ai.source,
  );
  if (!budget.ok) return fail(budget.message);

  const described =
    existing.rawInput && existing.rawInput !== existing.name
      ? `${existing.name}, ${existing.quantity} (from: "${existing.rawInput}")`
      : `${existing.name}, ${existing.quantity}`;

  const { analysis, source, fallbackReason, keyRefused } = await analyseFood(
    described,
    ai.apiKey,
  );

  if (source !== "ai") {
    void store.recordError(profile.id, {
      source: "server",
      kind: "ai-fallback",
      message: "Re-analysis fell back to the estimator",
      detail: fallbackReason ?? null,
      path: "/today",
    });
    return fail(
      keyRefused
        ? "Google refused your Gemini key. Check it in You, then try again."
        : "Momo's AI still cannot be reached — it is usually a daily limit. Try again later.",
    );
  }

  const best = analysis.foods.find((f) => !/^nothing/i.test(f.name.trim()));
  if (!best) return fail("Momo could not make sense of that one.");

  const updated = await store.updateFoodEntry(profile.id, entryId, {
    name: best.name,
    quantity: best.estimatedQuantity,
    emoji: resolveFoodEmoji(best.name, best.emoji),
    calories: round(best.calories),
    protein: round(best.protein, 1),
    carbs: round(best.carbs, 1),
    fat: round(best.fat, 1),
    fiber: round(best.fiber, 1),
    sugar: round(best.sugar, 1),
    confidence: best.confidence,
    assumptions: [...best.assumptions, ...analysis.assumptions],
    source: "ai",
  });
  if (!updated) return fail("That entry no longer exists.");

  const goals = await store.listGoalSnapshots(profile.id);
  const day = await recomputeDay(
    store,
    profile.id,
    updated.logDate,
    targetsForDate(goals, profile, updated.logDate),
  );
  const entries = await store.listFoodEntries(
    profile.id,
    updated.logDate,
    updated.logDate,
  );

  revalidateApp();
  return { ok: true, day, entries, entry: updated };
}

export async function repeatFoodAction(
  raw: unknown,
): Promise<ActionResult<{ day: DailyLog; entries: FoodEntry[]; added: FoodEntry[] }>> {
  const ctx = await withProfile();
  if (!ctx.ok) return fail(ctx.error);

  const parsed = RepeatFoodInput.safeParse(raw);
  if (!parsed.success) return fail("That entry could not be read.");

  const { profile, store } = ctx;
  const { sourceId, date } = parsed.data;

  const source = await store.getFoodEntry(profile.id, sourceId);
  if (!source) return fail("That food is no longer in your log.");

  const added = await saveEntries(store, profile.id, [
    {
      userId: profile.id,
      logDate: date,
      meal: parsed.data.meal ?? source.meal,
      name: source.name,
      quantity: source.quantity,
      emoji: source.emoji,
      calories: source.calories,
      protein: source.protein,
      carbs: source.carbs,
      fat: source.fat,
      fiber: source.fiber,
      sugar: source.sugar,
      confidence: source.confidence,
      assumptions: source.assumptions,
      alternatives: source.alternatives,
      rawInput: source.rawInput,
      source: source.source,
    },
  ]);

  // A refused write must not reach the route error boundary; the
  // composer shows this and keeps what was typed.
  if (!added) return fail(SAVE_FAILED);

  const goals = await store.listGoalSnapshots(profile.id);
  const day = await recomputeDay(
    store,
    profile.id,
    date,
    targetsForDate(goals, profile, date),
  );
  const entries = await store.listFoodEntries(profile.id, date, date);
  await refreshAchievements(store, profile, await userToday());

  revalidateApp();
  return { ok: true, day, entries, added };
}

/**
 * "No, it was the other one."
 *
 * A photo of a part-full glass of something dark came back as coffee when it
 * was a Coke Zero. That is not a fixable prompt problem — the two look the
 * same — so the model now commits to a guess and carries its runner-ups, and
 * this is how you take one.
 *
 * No model call: the alternative arrived with its own numbers when the photo
 * was first read. Correcting a guess should not cost a second one.
 *
 * The swapped-in reading keeps the alternatives, with the old headline guess
 * put back in the list, so a wrong correction is as easy to undo as it was
 * to make.
 */
export async function swapFoodAction(
  raw: unknown,
): Promise<ActionResult<{ day: DailyLog; entries: FoodEntry[] }>> {
  const ctx = await withProfile();
  if (!ctx.ok) return fail(ctx.error);

  const parsed = SwapFoodInput.safeParse(raw);
  if (!parsed.success) return fail("That swap could not be read.");

  const { profile, store } = ctx;
  const { id, index, date } = parsed.data;

  const entry = await store.getFoodEntry(profile.id, id);
  if (!entry) return fail("That entry no longer exists.");

  const picked = entry.alternatives[index];
  if (!picked) return fail("That option is no longer offered.");

  const wasCalled = {
    name: entry.name,
    emoji: entry.emoji,
    estimatedQuantity: entry.quantity,
    calories: entry.calories,
    protein: entry.protein,
    carbs: entry.carbs,
    fat: entry.fat,
    fiber: entry.fiber,
    sugar: entry.sugar,
  };

  const updated = await store.updateFoodEntry(profile.id, id, {
    name: picked.name,
    emoji: resolveFoodEmoji(picked.name, picked.emoji),
    quantity: picked.estimatedQuantity,
    calories: round(picked.calories),
    protein: round(picked.protein, 1),
    carbs: round(picked.carbs, 1),
    fat: round(picked.fat, 1),
    fiber: round(picked.fiber, 1),
    sugar: round(picked.sugar, 1),
    // You chose this, so it is no longer a guess.
    confidence: "high",
    alternatives: [
      wasCalled,
      ...entry.alternatives.filter((_, i) => i !== index),
    ].slice(0, 2),
  });
  if (!updated) return fail("That entry no longer exists.");

  // Remember it, the same way a hand edit is remembered.
  try {
    await store.saveFoodCorrection(profile.id, {
      nameKey: foodKey(updated.name),
      name: updated.name,
      quantity: updated.quantity,
      calories: updated.calories,
      protein: updated.protein,
      carbs: updated.carbs,
      fat: updated.fat,
      fiber: updated.fiber,
      sugar: updated.sugar,
    });
  } catch {
    // A correction that fails to save is not worth failing the swap over.
  }

  const goals = await store.listGoalSnapshots(profile.id);
  const day = await recomputeDay(
    store,
    profile.id,
    date,
    targetsForDate(goals, profile, date),
  );
  const entries = await store.listFoodEntries(profile.id, date, date);

  revalidateApp();
  return { ok: true, day, entries };
}

export async function updateFoodAction(
  raw: unknown,
): Promise<ActionResult<{ day: DailyLog; entries: FoodEntry[] }>> {
  const ctx = await withProfile();
  if (!ctx.ok) return fail(ctx.error);

  const parsed = EditFoodInput.safeParse(raw);
  if (!parsed.success) {
    return fail("Check those values.", zodFieldErrors(parsed.error.issues));
  }

  const { profile, store } = ctx;
  const { id, ...patch } = parsed.data;

  const updated = await store.updateFoodEntry(profile.id, id, {
    ...patch,
    source: "manual",
    confidence: "high",
  });
  if (!updated) return fail("That entry no longer exists.");

  // Remember it, so the same food is right next time rather than being
  // re-guessed and re-corrected forever.
  try {
    await store.saveFoodCorrection(profile.id, {
      nameKey: foodKey(updated.name),
      name: updated.name,
      quantity: updated.quantity,
      calories: updated.calories,
      protein: updated.protein,
      carbs: updated.carbs,
      fat: updated.fat,
      fiber: updated.fiber,
      sugar: updated.sugar,
    });
  } catch (error) {
    // Learning is a bonus; failing to learn must not fail the edit.
    console.warn("[macronaut] could not save correction:", error);
  }

  const goals = await store.listGoalSnapshots(profile.id);
  const day = await recomputeDay(
    store,
    profile.id,
    updated.logDate,
    targetsForDate(goals, profile, updated.logDate),
  );
  const entries = await store.listFoodEntries(
    profile.id,
    updated.logDate,
    updated.logDate,
  );

  revalidateApp();
  return { ok: true, day, entries };
}

export type CheckFoodPayload = {
  /** What it is, priced up, but not written anywhere. */
  items: CheckedFoodItem[];
  verdict: Verdict;
  /** The smaller serving that would fit, when the whole thing does not. */
  portion: { fraction: number; calories: number } | null;
  source: "ai" | "estimator";
  /** So the card can show the day it is talking about. */
  day: { eaten: number; target: number };
};

/**
 * Price something up without eating it.
 *
 * The app could only ever talk about food after it had been logged, which is
 * the wrong way round for the question people actually have in a shop. This
 * runs the same analysis and then writes nothing at all.
 *
 * It costs a model call, so it is charged to the same daily allowance as a
 * log — checking is not a way around the budget. Deciding to eat the thing
 * afterwards costs nothing more, because the numbers come back with the
 * answer and logCheckedFoodAction takes them as they are.
 */
export async function checkFoodAction(
  raw: unknown,
): Promise<ActionResult<CheckFoodPayload>> {
  const ctx = await withProfile();
  if (!ctx.ok) return fail(ctx.error);

  const parsed = CheckFoodInput.safeParse(raw);
  if (!parsed.success) {
    return fail(
      parsed.error.issues[0]?.message ?? "That input could not be read.",
    );
  }

  const { profile, store } = ctx;
  const { text, date } = parsed.data;

  const ai = await aiAccess(ctx);
  const budget = await consumeAiBudget(
    store,
    { id: profile.id, email: profile.email },
    await userToday(),
    "food",
    ai.source,
  );
  if (!budget.ok) return fail(budget.message);

  const { analysis, source } = await analyseFood(text, ai.apiKey);
  const usable = analysis.foods.filter((f) => !/^nothing/i.test(f.name.trim()));
  if (!usable.length) {
    return fail(
      "I could not work out what that is. Try naming the dish and rough amount.",
    );
  }

  // Corrections apply here too, or the check would quote a number the log
  // would then disagree with.
  const learned = await applyCorrections(store, profile.id, usable);

  const items: CheckedFoodItem[] = learned.foods.map((f) => ({
    name: f.name,
    quantity: f.estimatedQuantity,
    emoji: resolveFoodEmoji(f.name, f.emoji),
    meal: f.meal,
    calories: round(f.calories),
    protein: round(f.protein, 1),
    carbs: round(f.carbs, 1),
    fat: round(f.fat, 1),
    fiber: round(f.fiber, 1),
    sugar: round(f.sugar, 1),
    confidence: f.confidence,
    assumptions: [...f.assumptions, ...analysis.assumptions, ...learned.notes],
    rawInput: text,
    source: source === "ai" ? "ai" : "estimator",
  }));

  const goals = await store.listGoalSnapshots(profile.id);
  const targets = targetsForDate(goals, profile, date);
  const existing = await store.getDailyLog(profile.id, date);
  const totals = existing?.totals ?? emptyDay(profile.id, date, targets).totals;

  // One verdict for the whole thing: asking about "a burger and chips" is one
  // question, not two.
  const combined = {
    calories: items.reduce((a, i) => a + i.calories, 0),
    protein: items.reduce((a, i) => a + i.protein, 0),
    sugar: items.reduce((a, i) => a + i.sugar, 0),
  };
  const dayContext = {
    eaten: totals.calories,
    target: targets.calories,
    sugarEaten: totals.sugar,
    sugarCeiling: targets.sugar,
  };

  return {
    ok: true,
    items,
    verdict: verdictFor(combined, dayContext),
    portion: portionThatFits(combined, dayContext),
    source,
    day: { eaten: totals.calories, target: targets.calories },
  };
}

/**
 * Log something that was just checked, at the numbers it was checked at.
 *
 * No model call: re-analysing the same sentence a few seconds later would
 * spend a second one and could quietly come back with different numbers than
 * the ones the person just said yes to.
 */
export async function logCheckedFoodAction(
  raw: unknown,
): Promise<ActionResult<{ day: DailyLog; entries: FoodEntry[]; added: FoodEntry[] }>> {
  const ctx = await withProfile();
  if (!ctx.ok) return fail(ctx.error);

  const parsed = LogCheckedFoodInput.safeParse(raw);
  if (!parsed.success) return fail("Those numbers could not be read.");

  const { profile, store } = ctx;
  const { date, items } = parsed.data;

  const added = await saveEntries(store, profile.id, 
    items.map((f) => ({
      userId: profile.id,
      logDate: date,
      alternatives: [],
      ...f,
    })),
  );

  // A refused write must not reach the route error boundary; the
  // composer shows this and keeps what was typed.
  if (!added) return fail(SAVE_FAILED);

  const goals = await store.listGoalSnapshots(profile.id);
  const day = await recomputeDay(
    store,
    profile.id,
    date,
    targetsForDate(goals, profile, date),
  );
  const entries = await store.listFoodEntries(profile.id, date, date);
  await refreshAchievements(store, profile, await userToday());

  revalidateApp();
  return { ok: true, day, entries, added };
}

/**
 * Take back the entries a single log just created.
 *
 * Logging is one tap and the model is sometimes wrong, so the cost of a
 * mistake used to be: notice it, find the item, open it, delete it. This
 * makes it one tap back. Only ever called with ids the client was just
 * handed, and the store scopes every delete to the owner, so a guessed id
 * belonging to someone else deletes nothing.
 *
 * Missing ids are not an error. Undo races with the user deleting the same
 * entry by hand, and both outcomes are the one they asked for.
 */
export async function undoLogAction(
  raw: unknown,
): Promise<ActionResult<{ day: DailyLog; entries: FoodEntry[] }>> {
  const ctx = await withProfile();
  if (!ctx.ok) return fail(ctx.error);

  const parsed = UndoLogInput.safeParse(raw);
  if (!parsed.success) return fail("That could not be undone.");

  const { profile, store } = ctx;
  const { ids, date } = parsed.data;

  for (const id of ids) {
    await store.deleteFoodEntry(profile.id, id);
  }

  const goals = await store.listGoalSnapshots(profile.id);
  const day = await recomputeDay(
    store,
    profile.id,
    date,
    targetsForDate(goals, profile, date),
  );
  const entries = await store.listFoodEntries(profile.id, date, date);

  revalidateApp();
  return { ok: true, day, entries };
}

export async function deleteFoodAction(
  id: string,
  dateRaw: unknown,
): Promise<ActionResult<{ day: DailyLog; entries: FoodEntry[] }>> {
  const ctx = await withProfile();
  if (!ctx.ok) return fail(ctx.error);

  const { profile, store } = ctx;
  const date = await safeDate(dateRaw);

  await store.deleteFoodEntry(profile.id, id);

  const goals = await store.listGoalSnapshots(profile.id);
  const day = await recomputeDay(
    store,
    profile.id,
    date,
    targetsForDate(goals, profile, date),
  );
  const entries = await store.listFoodEntries(profile.id, date, date);

  revalidateApp();
  return { ok: true, day, entries };
}

/* ================================================================== */
/* Daily coach                                                         */
/* ================================================================== */

export async function ensureDailyCoachAction(
  dateRaw: unknown,
  force = false,
): Promise<ActionResult<{ coach: AiCoachNote | null; day: DailyLog }>> {
  const ctx = await withProfile();
  if (!ctx.ok) return fail(ctx.error);

  const { profile, store } = ctx;
  const date = await safeDate(dateRaw);
  const goals = await store.listGoalSnapshots(profile.id);
  const targets = targetsForDate(goals, profile, date);

  const day =
    (await store.getDailyLog(profile.id, date)) ??
    emptyDay(profile.id, date, targets);

  if (day.entryCount === 0) {
    return { ok: true, coach: null, day };
  }

  const signature = coachSignature(day.totals, day.entryCount);
  if (!force && day.coachSignature === signature && day.coach) {
    return { ok: true, coach: day.coach, day };
  }

  const [entries, recent, weights] = await Promise.all([
    store.listFoodEntries(profile.id, date, date),
    store.listDailyLogs(profile.id, addDays(date, -7), addDays(date, -1)),
    store.listWeightLogs(profile.id),
  ]);

  const history = await store.listDailyLogs(
    profile.id,
    addDays(date, -60),
    date,
  );

  const ai = await aiAccess(ctx);
  const budget = await consumeAiBudget(
    store,
    { id: profile.id, email: profile.email },
    await userToday(),
    "coach",
    ai.source,
  );
  if (!budget.ok) return fail(budget.message);

  const { note } = await writeDailyNote({
    dateLabel: relativeDayLabel(date),
    totals: day.totals,
    targets: day.targets,
    entryNames: entries.map((e) => `${e.quantity} ${e.name}`),
    score: day.score,
    recentDays: [...recent]
      .reverse()
      .filter((d) => d.entryCount > 0)
      .slice(0, 5)
      .map((d) => ({
        label: relativeDayLabel(d.logDate, date),
        calories: d.totals.calories,
        target: d.targets.calories,
        protein: d.totals.protein,
      })),
    streakDays: computeStreaks(history, date).logging,
    weightNoteKg: weights.at(-1)?.weightKg ?? null,
    targetWeightKg: profile.targetWeightKg,
    weeklyLossKg: profile.weeklyLossKg,
  }, ai.apiKey);

  const saved = await store.upsertDailyLog(profile.id, date, {
    targets: day.targets,
    totals: day.totals,
    entryCount: day.entryCount,
    score: day.score,
    status: day.status,
    coach: note,
    coachGeneratedAt: new Date().toISOString(),
    coachSignature: signature,
  });

  revalidatePath("/today");
  revalidatePath("/history");
  return { ok: true, coach: note, day: saved };
}

/* ================================================================== */
/* Weight                                                              */
/* ================================================================== */

/**
 * `previousKg` is the number this reading should be compared against: the most
 * recent reading strictly *before* the date being written.
 *
 * It is computed here rather than passed in from the page, which is how the
 * app came to congratulate someone for logging 119.7 twice in a row. The
 * dialog was handed the second-to-last reading from whenever the page last
 * rendered, so re-weighing at the same number compared it against the one
 * before that — a genuine loss, announced as if it had just happened.
 *
 * "Strictly before the date" is right for every case, because a weigh-in is an
 * upsert keyed on its date: re-logging today replaces today's number, so the
 * thing it moved from is yesterday's, and back-dating compares against
 * whatever came before that date rather than against a later reading.
 */
export async function logWeightAction(
  raw: unknown,
): Promise<
  ActionResult<{
    id: string;
    previousKg: number | null;
    unlocked: { key: string; name: string; emoji: string }[];
  }>
> {
  const ctx = await withProfile();
  if (!ctx.ok) return fail(ctx.error);

  const parsed = LogWeightInput.safeParse(raw);
  if (!parsed.success) {
    return fail(
      parsed.error.issues[0]?.message ?? "That weight looks out of range.",
    );
  }

  const { profile, store } = ctx;
  const { weightKg, date, note } = parsed.data;

  const row = await store.upsertWeightLog(
    profile.id,
    date,
    round(weightKg, 2),
    note ?? null,
  );

  // Only the most recent reading drives "current weight".
  const all = await store.listWeightLogs(profile.id);
  const latest = all.at(-1);
  const before = weightBefore(all, date);
  if (latest && latest.loggedOn === date) {
    await store.patchProfile(profile.id, { currentWeightKg: round(weightKg, 2) });
  }

  /*
   * Re-target on the way past.
   *
   * BMR is mostly a function of body mass, so the calorie target that
   * produces a given weekly loss falls as you get lighter. Nothing used to
   * move it: targets came from a goal snapshot written only at onboarding
   * and when the plan was saved by hand, so the number stayed pinned to
   * whatever you weighed on the day you last opened the profile page. It
   * drifts generous exactly as you succeed, which is the classic stall.
   *
   * Only for a reading that is now the newest one — back-filling last
   * Tuesday should not move today's plan — and only when the recomputed
   * calories actually differ, so a run of identical weigh-ins does not lay
   * down a snapshot a day.
   *
   * Today forward only. `targetsForDate` picks the snapshot in force on a
   * given day, so days already logged keep the plan they were scored
   * against; this writes one effective from today and re-scores today,
   * exactly as saving the plan by hand does.
   */
  const isNewest = !latest || latest.loggedOn <= date;
  if (isNewest) {
    const today = await userToday();
    const current = await store.listGoalSnapshots(profile.id);
    const inForce = targetsForDate(current, profile, today);
    const retuned = computeTargets({
      age: profile.age,
      gender: profile.gender,
      heightCm: profile.heightCm,
      weightKg: round(weightKg, 2),
      targetWeightKg: profile.targetWeightKg,
      weeklyLossKg: profile.weeklyLossKg,
      activityLevel: profile.activityLevel,
    });

    if (retuned.calories !== inForce.calories) {
      await store.insertGoalSnapshot({
        userId: profile.id,
        effectiveFrom: today,
        age: profile.age,
        gender: profile.gender,
        heightCm: profile.heightCm,
        weightKg: round(weightKg, 2),
        targetWeightKg: profile.targetWeightKg,
        weeklyLossKg: profile.weeklyLossKg,
        activityLevel: profile.activityLevel,
        targets: retuned,
      });
      await recomputeDay(store, profile.id, today, retuned);
    }
  }

  const unlockedKeys = await refreshAchievements(
    store,
    { ...profile, currentWeightKg: round(weightKg, 2) },
    await userToday(),
  );

  revalidateApp();

  return {
    ok: true,
    id: row.id,
    previousKg: before?.weightKg ?? null,
    unlocked: unlockedKeys.flatMap((key) => {
      const def = ACHIEVEMENT_BY_KEY.get(key);
      return def ? [{ key, name: def.name, emoji: def.emoji }] : [];
    }),
  };
}

export async function ensureWeightCoachAction(
  id: string,
): Promise<ActionResult<{ coach: AiWeightNote }>> {
  const ctx = await withProfile();
  if (!ctx.ok) return fail(ctx.error);

  const { profile, store } = ctx;
  const all = await store.listWeightLogs(profile.id);
  const index = all.findIndex((w) => w.id === id);
  if (index < 0) return fail("That reading no longer exists.");

  const row = all[index];
  if (row.coach) return { ok: true, coach: row.coach };

  const today = await userToday();
  const upTo = all.slice(0, index + 1);
  const stats = weightStats(upTo, today);
  const journey = computeJourney({
    startKg: profile.startingWeightKg,
    currentKg: row.weightKg,
    targetKg: profile.targetWeightKg,
    weeklyLossKg: profile.weeklyLossKg,
    fromIsoDate: today,
  });

  const previous = index > 0 ? all[index - 1] : null;

  const ai = await aiAccess(ctx);
  const budget = await consumeAiBudget(
    store,
    { id: profile.id, email: profile.email },
    await userToday(),
    "coach",
    ai.source,
  );
  if (!budget.ok) return fail(budget.message);

  const { note } = await writeWeightNote({
    newWeightKg: round(row.weightKg, 1),
    previousWeightKg: previous ? round(previous.weightKg, 1) : null,
    previousLabel: previous ? relativeDayLabel(previous.loggedOn, today) : null,
    change7: stats.change7,
    change14: stats.change14,
    ratePerWeek: stats.ratePerWeek,
    startingWeightKg: round(profile.startingWeightKg, 1),
    targetWeightKg: round(profile.targetWeightKg, 1),
    weeklyLossKg: profile.weeklyLossKg,
    totalReadings: upTo.length,
    percentToGoal: journey.percent,
  }, ai.apiKey);

  await store.setWeightCoach(profile.id, id, note);
  revalidatePath("/progress");
  return { ok: true, coach: note };
}

export async function deleteWeightAction(
  id: string,
): Promise<ActionResult<{ done: true }>> {
  const ctx = await withProfile();
  if (!ctx.ok) return fail(ctx.error);

  const { profile, store } = ctx;
  await store.deleteWeightLog(profile.id, id);

  const remaining = await store.listWeightLogs(profile.id);
  const latest = remaining.at(-1);
  if (latest) {
    await store.patchProfile(profile.id, {
      currentWeightKg: round(latest.weightKg, 2),
    });
  }

  revalidateApp();
  return { ok: true, done: true };
}

/* ================================================================== */
/* Reports                                                             */
/* ================================================================== */

/**
 * Hand back a recap only if one has already been written.
 *
 * Cheap by construction: a couple of reads and no model call, so opening
 * Insights cannot sit on a function for seconds or spend the day's report
 * allowance on somebody who was only passing through.
 */
export async function peekReportAction(
  periodRaw: unknown,
): Promise<ActionResult<{ report: AiPeriodReport | null }>> {
  const ctx = await withProfile();
  if (!ctx.ok) return fail(ctx.error);

  const parsed = ReportPeriod.safeParse(periodRaw);
  if (!parsed.success) return fail("Unknown report period.");

  const found = await readCachedReport({
    store: ctx.store,
    profile: ctx.profile,
    today: await userToday(),
    period: parsed.data,
  });
  return { ok: true, report: found?.report ?? null };
}

export async function generateReportAction(
  periodRaw: unknown,
  force = false,
): Promise<ActionResult<{ report: AiPeriodReport; periodStart: Iso; periodEnd: Iso }>> {
  const ctx = await withProfile();
  if (!ctx.ok) return fail(ctx.error);

  const parsedPeriod = ReportPeriod.safeParse(periodRaw);
  if (!parsedPeriod.success) return fail("Unknown report period.");

  const result = await buildPeriodReport({
    store: ctx.store,
    profile: ctx.profile,
    today: await userToday(),
    period: parsedPeriod.data,
    force,
  });
  if (!result.ok) return fail(result.error);

  revalidatePath("/insights");
  return {
    ok: true,
    report: result.report,
    periodStart: result.periodStart,
    periodEnd: result.periodEnd,
  };
}

/* ================================================================== */
/* Your own Gemini key                                                 */
/* ================================================================== */

export type AiKeyStatus = {
  /** Whose key calls go out on right now. */
  source: AiAccess["source"];
  /** Last four characters of the saved key, if there is one. */
  hint: string | null;
};

/**
 * Check a pasted key with Google, then keep it — encrypted — for this account.
 *
 * Works before onboarding finishes: the key belongs to the sign-in, not the
 * profile, so asking for it can be one of the onboarding steps.
 */
export async function saveAiKeyAction(
  raw: unknown,
): Promise<ActionResult<AiKeyStatus>> {
  const session = await getSession();
  if (!session) return fail("Your session expired. Sign in again.");

  const key = typeof raw === "string" ? raw.trim() : "";
  if (!key) return fail("Paste your key first.");
  // Google's keys are 39 characters with no spaces. Anything far from that is
  // a paste of the wrong thing, and is not worth a round trip to find out.
  if (key.length < 30 || key.length > 200 || /\s/.test(key)) {
    return fail(
      "That does not look like a Gemini key. It is one long string starting with AIza.",
    );
  }

  if (!canStoreKeys()) {
    return fail(
      "Saving keys is not set up on this server yet (MACRONAUT_ENCRYPTION_KEY is missing).",
    );
  }

  const store = await getStore();
  const budget = await consumeAiBudget(
    store,
    { id: session.userId, email: session.email },
    await userToday(),
    "key",
  );
  if (!budget.ok) return fail(budget.message);

  const check = await checkGeminiKey(key);
  if (!check.ok) return fail(check.message);

  try {
    await store.saveAiKey(session.userId, {
      sealed: await sealKey(key, session.userId),
      hint: keyHint(key),
    });
  } catch (error) {
    console.warn("[macronaut] could not save a Gemini key:", error);
    return fail("The key works, but it could not be saved just now. Try again.");
  }

  revalidateApp();
  return { ok: true, source: "own", hint: keyHint(key) };
}

export async function removeAiKeyAction(): Promise<ActionResult<AiKeyStatus>> {
  const session = await getSession();
  if (!session) return fail("Your session expired. Sign in again.");

  const store = await getStore();
  try {
    await store.deleteAiKey(session.userId);
  } catch (error) {
    console.warn("[macronaut] could not remove a Gemini key:", error);
    return fail("The key could not be removed just now. Try again.");
  }

  const after = await resolveAiAccess(store, {
    id: session.userId,
    email: session.email,
  });
  revalidateApp();
  return { ok: true, source: after.source, hint: null };
}

/* ================================================================== */
/* Auth (Supabase mode only)                                           */
/* ================================================================== */

export async function signUpAction(
  raw: unknown,
): Promise<ActionResult<{ needsConfirmation: boolean }>> {
  if (!isSupabaseConfigured) return fail("Auth is disabled in solo mode.");

  const parsed = CredentialsInput.safeParse(raw);
  if (!parsed.success) {
    return fail("Check your details.", zodFieldErrors(parsed.error.issues));
  }

  const sb = await getSupabaseServerClient();
  if (!sb) return fail("Auth is unavailable.");

  const { data, error } = await sb.auth.signUp(parsed.data);
  if (error) return fail(error.message);

  return { ok: true, needsConfirmation: !data.session };
}

export async function signInAction(
  raw: unknown,
): Promise<ActionResult<{ done: true }>> {
  if (!isSupabaseConfigured) return fail("Auth is disabled in solo mode.");

  const parsed = CredentialsInput.safeParse(raw);
  if (!parsed.success) {
    return fail("Check your details.", zodFieldErrors(parsed.error.issues));
  }

  const sb = await getSupabaseServerClient();
  if (!sb) return fail("Auth is unavailable.");

  const { error } = await sb.auth.signInWithPassword(parsed.data);
  if (error) return fail(error.message);

  revalidateApp();
  return { ok: true, done: true };
}

export async function signOutAction(): Promise<void> {
  const sb = await getSupabaseServerClient();
  await sb?.auth.signOut();
  revalidateApp();
  redirect("/welcome");
}

/**
 * Remove the account itself, not just what is in it.
 *
 * Every table hangs off the auth user by a cascading foreign key, but the data
 * is wiped through the ordinary store first so it goes even if the auth call
 * fails. Deleting the auth user needs the service-role client — nobody can
 * delete their own through RLS — and the id comes from the verified session,
 * never from the request.
 */
export async function deleteAccountAction(): Promise<ActionResult<{ done: true }>> {
  if (!isSupabaseConfigured) return fail("Solo mode has no account to delete.");
  const session = await getSession();
  if (!session) return fail("Your session expired. Sign in again.");

  const admin = createSupabaseAdminClient();
  if (!admin) return fail("Account deletion is not set up on this server yet.");

  const store = await getStore();
  await store.wipeUser(session.userId);

  const { error } = await admin.auth.admin.deleteUser(session.userId);
  if (error) {
    console.warn("[macronaut] could not delete an auth user:", error.message);
    return fail(
      "Your data is gone, but the sign-in could not be removed. Try again.",
    );
  }

  const sb = await getSupabaseServerClient();
  await sb?.auth.signOut().catch(() => undefined);
  revalidateApp();
  return { ok: true, done: true };
}

export async function resetAccountAction(): Promise<ActionResult<{ done: true }>> {
  const session = await getSession();
  if (!session) return fail("No session.");
  const store = await getStore();
  await store.wipeUser(session.userId);
  revalidateApp();
  return { ok: true, done: true };
}
