"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  CredentialsInput,
  EditFoodInput,
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
import { computeStreaks, periodPair, weightStats } from "@/lib/insights";
import { analyseFood } from "@/lib/ai/food";
import {
  writeDailyNote,
  writePeriodReport,
  writeWeightNote,
} from "@/lib/ai/coach";
import {
  coachSignature,
  emptyDay,
  recomputeDay,
  refreshAchievements,
  targetsForDate,
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
  unlocked: { key: string; name: string; emoji: string }[];
};

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

  const { analysis, source } = await analyseFood(text);

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

  const added = await store.insertFoodEntries(
    usable.map((f) => ({
      userId: profile.id,
      logDate: date,
      meal: f.meal,
      name: f.name,
      quantity: f.estimatedQuantity,
      emoji: f.emoji || "🍽️",
      calories: round(f.calories),
      protein: round(f.protein, 1),
      carbs: round(f.carbs, 1),
      fat: round(f.fat, 1),
      fiber: round(f.fiber, 1),
      sugar: round(f.sugar, 1),
      confidence: f.confidence,
      assumptions: analysis.assumptions,
      rawInput: text,
      source: source === "ai" ? "ai" : "estimator",
    })),
  );

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
    unlocked: unlockedKeys.flatMap((key) => {
      const def = ACHIEVEMENT_BY_KEY.get(key);
      return def ? [{ key, name: def.name, emoji: def.emoji }] : [];
    }),
  };
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
  });

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

export async function logWeightAction(
  raw: unknown,
): Promise<ActionResult<{ id: string; unlocked: { key: string; name: string; emoji: string }[] }>> {
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
  if (latest && latest.loggedOn === date) {
    await store.patchProfile(profile.id, { currentWeightKg: round(weightKg, 2) });
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
  });

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

const PERIOD_LENGTH: Record<string, number> = { "7d": 7, "14d": 14, "30d": 30 };

export async function generateReportAction(
  periodRaw: unknown,
  force = false,
): Promise<ActionResult<{ report: AiPeriodReport; periodStart: Iso; periodEnd: Iso }>> {
  const ctx = await withProfile();
  if (!ctx.ok) return fail(ctx.error);

  const parsedPeriod = ReportPeriod.safeParse(periodRaw);
  if (!parsedPeriod.success) return fail("Unknown report period.");
  const period = parsedPeriod.data;
  const length = PERIOD_LENGTH[period];

  const { profile, store } = ctx;
  const today = await userToday();
  const start = addDays(today, -(length - 1));

  const days = await store.listDailyLogs(
    profile.id,
    addDays(start, -length),
    today,
  );
  const { current, previous } = periodPair(days, today, length);

  if (current.daysLogged === 0) {
    return fail("Log a few days first and this report will have something to say.");
  }

  const signature = createHash("sha1")
    .update(
      [
        period,
        today,
        current.daysLogged,
        current.avgCalories,
        current.avgProtein,
        current.onTargetDays,
        previous.avgCalories,
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 16);

  if (!force) {
    const cached = await store.getReport(profile.id, period, signature);
    if (cached) {
      return {
        ok: true,
        report: cached.report,
        periodStart: cached.periodStart,
        periodEnd: cached.periodEnd,
      };
    }
  }

  const weights = await store.listWeightLogs(profile.id);
  const inWindow = weights.filter(
    (w) => w.loggedOn >= start && w.loggedOn <= today,
  );

  const { report } = await writePeriodReport({
    period,
    current,
    previous,
    days: days.filter((d) => d.logDate >= start),
    weightStart: inWindow[0] ? round(inWindow[0].weightKg, 1) : null,
    weightEnd: inWindow.at(-1) ? round(inWindow.at(-1)!.weightKg, 1) : null,
    targetWeightKg: round(profile.targetWeightKg, 1),
    weeklyLossKg: profile.weeklyLossKg,
  });

  await store.saveReport({
    userId: profile.id,
    period,
    periodStart: start,
    periodEnd: today,
    signature,
    report,
  });

  revalidatePath("/insights");
  return { ok: true, report, periodStart: start, periodEnd: today };
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

export async function resetAccountAction(): Promise<ActionResult<{ done: true }>> {
  const session = await getSession();
  if (!session) return fail("No session.");
  const store = await getStore();
  await store.wipeUser(session.userId);
  revalidateApp();
  return { ok: true, done: true };
}
