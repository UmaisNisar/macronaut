import "server-only";

import { createHash } from "node:crypto";

import type { DataStore } from "@/lib/db/store";
import type {
  DailyLog,
  FoodEntry,
  GoalSnapshot,
  Macros,
  Profile,
  Targets,
} from "@/lib/schemas";
import { addDays, type Iso, lastNDays, todayIso } from "@/lib/date";
import {
  computeJourney,
  computeTargets,
  emptyMacros,
  round,
  scoreDay,
} from "@/lib/nutrition";
import { computeStreaks, summarisePeriod, weightStats } from "@/lib/insights";
import { earnedKeys } from "@/lib/achievements";

/* ------------------------------------------------------------------ */
/* Targets over time                                                   */
/* ------------------------------------------------------------------ */

/**
 * The plan that was in force on `dateIso`. Editing today's goals must never
 * rewrite what last month's numbers meant, so history reads from snapshots.
 */
export function targetsForDate(
  goals: GoalSnapshot[],
  profile: Profile,
  dateIso: Iso,
): Targets {
  let chosen: GoalSnapshot | null = null;
  for (const g of goals) {
    if (g.effectiveFrom <= dateIso) chosen = g;
    else break;
  }
  // Before the first snapshot, the earliest plan is the closest truth we have.
  if (!chosen && goals.length) chosen = goals[0];
  if (chosen) return chosen.targets;

  return computeTargets({
    age: profile.age,
    gender: profile.gender,
    heightCm: profile.heightCm,
    weightKg: profile.currentWeightKg,
    targetWeightKg: profile.targetWeightKg,
    weeklyLossKg: profile.weeklyLossKg,
    activityLevel: profile.activityLevel,
  });
}

export function targetsFromProfile(profile: Profile): Targets {
  return computeTargets({
    age: profile.age,
    gender: profile.gender,
    heightCm: profile.heightCm,
    weightKg: profile.currentWeightKg,
    targetWeightKg: profile.targetWeightKg,
    weeklyLossKg: profile.weeklyLossKg,
    activityLevel: profile.activityLevel,
  });
}

/* ------------------------------------------------------------------ */
/* Day rollup                                                          */
/* ------------------------------------------------------------------ */

export function sumMacros(entries: FoodEntry[]): Macros {
  return entries.reduce<Macros>(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      protein: acc.protein + e.protein,
      carbs: acc.carbs + e.carbs,
      fat: acc.fat + e.fat,
      fiber: acc.fiber + e.fiber,
      sugar: acc.sugar + e.sugar,
    }),
    emptyMacros(),
  );
}

/** Cheap fingerprint of a day's intake — tells us when a coach note is stale. */
export function coachSignature(totals: Macros, entryCount: number): string {
  return createHash("sha1")
    .update(
      [
        Math.round(totals.calories),
        Math.round(totals.protein),
        Math.round(totals.carbs),
        Math.round(totals.fat),
        entryCount,
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 16);
}

/**
 * Rewrites the daily rollup from its food entries. Keeps any existing coach
 * note but leaves its signature intact so callers can tell it is out of date.
 */
export async function recomputeDay(
  store: DataStore,
  userId: string,
  dateIso: Iso,
  targets: Targets,
): Promise<DailyLog> {
  const entries = await store.listFoodEntries(userId, dateIso, dateIso);
  const raw = sumMacros(entries);
  const totals: Macros = {
    calories: round(raw.calories),
    protein: round(raw.protein, 1),
    carbs: round(raw.carbs, 1),
    fat: round(raw.fat, 1),
    fiber: round(raw.fiber, 1),
    sugar: round(raw.sugar, 1),
  };

  const { score, status } = scoreDay({
    totals,
    targets,
    entryCount: entries.length,
  });

  const existing = await store.getDailyLog(userId, dateIso);

  return store.upsertDailyLog(userId, dateIso, {
    targets,
    totals,
    entryCount: entries.length,
    score,
    status,
    coach: existing?.coach ?? null,
    coachGeneratedAt: existing?.coachGeneratedAt ?? null,
    coachSignature: existing?.coachSignature ?? null,
  });
}

/** A blank-but-valid day, so pages never have to branch on "no row yet". */
export function emptyDay(
  userId: string,
  dateIso: Iso,
  targets: Targets,
): DailyLog {
  return {
    id: `virtual-${dateIso}`,
    userId,
    logDate: dateIso,
    targets,
    totals: emptyMacros(),
    entryCount: 0,
    score: 0,
    status: "unlogged",
    coach: null,
    coachGeneratedAt: null,
    coachSignature: null,
  };
}

/* ------------------------------------------------------------------ */
/* Achievements                                                        */
/* ------------------------------------------------------------------ */

export async function refreshAchievements(
  store: DataStore,
  profile: Profile,
  today: Iso = todayIso(),
): Promise<string[]> {
  const [days, weights] = await Promise.all([
    store.listDailyLogs(profile.id, addDays(today, -365), today),
    store.listWeightLogs(profile.id),
  ]);

  const streaks = computeStreaks(days, today);
  const w = weightStats(weights, today);
  const last7 = new Set(lastNDays(today, 7));
  const week = days.filter((d) => last7.has(d.logDate) && d.entryCount > 0);

  const journey = computeJourney({
    startKg: profile.startingWeightKg,
    currentKg: w.latest?.weightKg ?? profile.currentWeightKg,
    targetKg: profile.targetWeightKg,
    weeklyLossKg: profile.weeklyLossKg,
    fromIsoDate: today,
  });

  const fortnight = summarisePeriod(days, addDays(today, -13), today);

  const keys = earnedKeys({
    streaks,
    journey,
    days,
    weightCount: weights.length,
    bestScore: days.reduce((m, d) => Math.max(m, d.score), 0),
    proteinHitsLast7: week.filter(
      (d) => d.totals.protein >= d.targets.protein * 0.95,
    ).length,
    fiberHitsLast7: week.filter((d) => d.totals.fiber >= d.targets.fiber * 0.95)
      .length,
    consistency14: fortnight.consistency,
  });

  const fresh = await store.unlockAchievements(profile.id, keys, today);
  return fresh.map((a) => a.key);
}
