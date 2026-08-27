import type { DailyLog, WeightLog } from "@/lib/schemas";
import { addDays, diffDays, type Iso, lastNDays } from "@/lib/date";
import { isOnTarget, linearFit, mean, round } from "@/lib/nutrition";

/* ------------------------------------------------------------------ */
/* Period aggregates                                                   */
/* ------------------------------------------------------------------ */

export type PeriodStats = {
  startIso: Iso;
  endIso: Iso;
  totalDays: number;
  daysLogged: number;
  avgCalories: number;
  avgProtein: number;
  avgCarbs: number;
  avgFat: number;
  avgFiber: number;
  avgTarget: number;
  avgScore: number;
  onTargetDays: number;
  /** Share of days in the window that landed inside the calorie band, 0–1. */
  consistency: number;
  bestDay: DailyLog | null;
  hardestDay: DailyLog | null;
  totalCalories: number;
};

const logged = (days: DailyLog[]) => days.filter((d) => d.entryCount > 0);

export function summarisePeriod(
  days: DailyLog[],
  startIso: Iso,
  endIso: Iso,
): PeriodStats {
  const window = days.filter((d) => d.logDate >= startIso && d.logDate <= endIso);
  const active = logged(window);
  const totalDays = diffDays(startIso, endIso) + 1;

  const onTargetDays = active.filter((d) =>
    isOnTarget(d.totals.calories, d.targets.calories),
  ).length;

  const sorted = [...active].sort((a, b) => b.score - a.score);

  return {
    startIso,
    endIso,
    totalDays,
    daysLogged: active.length,
    avgCalories: round(mean(active.map((d) => d.totals.calories))),
    avgProtein: round(mean(active.map((d) => d.totals.protein))),
    avgCarbs: round(mean(active.map((d) => d.totals.carbs))),
    avgFat: round(mean(active.map((d) => d.totals.fat))),
    avgFiber: round(mean(active.map((d) => d.totals.fiber))),
    avgTarget: round(mean(active.map((d) => d.targets.calories))),
    avgScore: round(mean(active.map((d) => d.score))),
    onTargetDays,
    consistency: totalDays > 0 ? onTargetDays / totalDays : 0,
    bestDay: sorted[0] ?? null,
    hardestDay: sorted.length > 1 ? sorted[sorted.length - 1] : null,
    totalCalories: round(active.reduce((a, d) => a + d.totals.calories, 0)),
  };
}

/** The window of `days` length ending on `endIso`, plus the one before it. */
export function periodPair(
  days: DailyLog[],
  endIso: Iso,
  length: number,
): { current: PeriodStats; previous: PeriodStats } {
  const curStart = addDays(endIso, -(length - 1));
  const prevEnd = addDays(curStart, -1);
  const prevStart = addDays(prevEnd, -(length - 1));
  return {
    current: summarisePeriod(days, curStart, endIso),
    previous: summarisePeriod(days, prevStart, prevEnd),
  };
}

/* ------------------------------------------------------------------ */
/* Comparison lines                                                    */
/* ------------------------------------------------------------------ */

export type Insight = {
  id: string;
  icon: string;
  text: string;
  direction: "good" | "bad" | "neutral";
  /** Rendered as a big number beside the sentence when present. */
  metric?: string;
};

const delta = (a: number, b: number) => round(a - b);

export function buildInsights(
  current: PeriodStats,
  previous: PeriodStats,
  weights: WeightLog[],
): Insight[] {
  const out: Insight[] = [];
  const comparable = previous.daysLogged >= 2 && current.daysLogged >= 2;

  if (comparable) {
    const calDelta = delta(current.avgCalories, previous.avgCalories);
    if (Math.abs(calDelta) >= 40) {
      out.push({
        id: "calories",
        icon: calDelta < 0 ? "📉" : "📈",
        metric: `${calDelta < 0 ? "−" : "+"}${Math.abs(calDelta)} kcal`,
        text:
          calDelta < 0
            ? `You are averaging ${Math.abs(calDelta)} fewer calories a day than the previous ${previous.totalDays} days.`
            : `You are averaging ${calDelta} more calories a day than the previous ${previous.totalDays} days.`,
        direction: calDelta < 0 ? "good" : "bad",
      });
    }

    const proteinDelta = delta(current.avgProtein, previous.avgProtein);
    if (Math.abs(proteinDelta) >= 8) {
      out.push({
        id: "protein",
        icon: proteinDelta > 0 ? "💪" : "🥚",
        metric: `${proteinDelta > 0 ? "+" : "−"}${Math.abs(proteinDelta)} g`,
        text:
          proteinDelta > 0
            ? `Average protein is up ${proteinDelta} g a day on the previous period.`
            : `Average protein has dropped ${Math.abs(proteinDelta)} g a day. Worth rebuilding.`,
        direction: proteinDelta > 0 ? "good" : "bad",
      });
    }

    const consistencyNow = Math.round(current.consistency * 100);
    const consistencyBefore = Math.round(previous.consistency * 100);
    if (Math.abs(consistencyNow - consistencyBefore) >= 8) {
      out.push({
        id: "consistency",
        icon: consistencyNow > consistencyBefore ? "🎯" : "🌀",
        metric: `${consistencyBefore}% → ${consistencyNow}%`,
        text:
          consistencyNow > consistencyBefore
            ? `Your consistency score improved from ${consistencyBefore}% to ${consistencyNow}%.`
            : `Consistency slipped from ${consistencyBefore}% to ${consistencyNow}%. Small, boring days fix this fastest.`,
        direction: consistencyNow > consistencyBefore ? "good" : "bad",
      });
    }

    const fiberDelta = delta(current.avgFiber, previous.avgFiber);
    if (Math.abs(fiberDelta) >= 4) {
      out.push({
        id: "fiber",
        icon: "🌾",
        metric: `${fiberDelta > 0 ? "+" : "−"}${Math.abs(fiberDelta)} g`,
        text: `Fiber intake ${fiberDelta > 0 ? "climbed" : "fell"} by ${Math.abs(fiberDelta)} g a day.`,
        direction: fiberDelta > 0 ? "good" : "neutral",
      });
    }
  }

  if (current.daysLogged >= 1) {
    out.push({
      id: "on-target",
      icon: "🔥",
      metric: `${current.onTargetDays}/${current.totalDays}`,
      text: `You stayed inside your calorie band on ${current.onTargetDays} of the last ${current.totalDays} days.`,
      direction:
        current.onTargetDays / current.totalDays >= 0.5 ? "good" : "neutral",
    });
  }

  const w = weightWindow(weights, current.startIso, current.endIso);
  if (w.first && w.last && w.first.id !== w.last.id) {
    const change = round(w.last.weightKg - w.first.weightKg, 1);
    out.push({
      id: "weight",
      icon: change < 0 ? "⚖️" : "📊",
      metric: `${change > 0 ? "+" : "−"}${Math.abs(change)} kg`,
      text:
        change < 0
          ? `The scale moved down ${Math.abs(change)} kg across this window.`
          : change > 0
            ? `The scale is up ${change} kg across this window — check the trend line before reading much into it.`
            : `Weight held steady across this window.`,
      direction: change < 0 ? "good" : change > 0 ? "bad" : "neutral",
    });
  }

  if (!out.length) {
    out.push({
      id: "empty",
      icon: "🛰️",
      text: "Not enough logged days yet to compare periods. A few more days and this fills up fast.",
      direction: "neutral",
    });
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Weight trends                                                       */
/* ------------------------------------------------------------------ */

export type WeightStats = {
  latest: WeightLog | null;
  previous: WeightLog | null;
  first: WeightLog | null;
  change7: number | null;
  change14: number | null;
  change30: number | null;
  /** Regression slope over the last 28 days, in kg per week. */
  ratePerWeek: number | null;
  count: number;
};

function weightWindow(weights: WeightLog[], startIso: Iso, endIso: Iso) {
  const within = weights.filter(
    (w) => w.loggedOn >= startIso && w.loggedOn <= endIso,
  );
  return { first: within[0] ?? null, last: within[within.length - 1] ?? null };
}

/** Nearest reading at or before `iso`, so gaps in logging do not break deltas. */
function weightAtOrBefore(weights: WeightLog[], iso: Iso): WeightLog | null {
  let found: WeightLog | null = null;
  for (const w of weights) {
    if (w.loggedOn <= iso) found = w;
    else break;
  }
  return found;
}

export function weightStats(weights: WeightLog[], todayIsoDate: Iso): WeightStats {
  const sorted = [...weights].sort((a, b) => a.loggedOn.localeCompare(b.loggedOn));
  const latest = sorted[sorted.length - 1] ?? null;
  const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;

  const changeOver = (days: number): number | null => {
    if (!latest) return null;
    const then = weightAtOrBefore(sorted, addDays(latest.loggedOn, -days));
    if (!then || then.id === latest.id) return null;
    return round(latest.weightKg - then.weightKg, 1);
  };

  const recent = sorted.filter(
    (w) => diffDays(w.loggedOn, todayIsoDate) <= 28,
  );
  const fit =
    recent.length >= 3
      ? linearFit(
          recent.map((w) => ({
            x: diffDays(recent[0].loggedOn, w.loggedOn),
            y: w.weightKg,
          })),
        )
      : null;

  return {
    latest,
    previous,
    first: sorted[0] ?? null,
    change7: changeOver(7),
    change14: changeOver(14),
    change30: changeOver(30),
    ratePerWeek: fit ? round(fit.slope * 7, 2) : null,
    count: sorted.length,
  };
}

/* ------------------------------------------------------------------ */
/* Streaks                                                             */
/* ------------------------------------------------------------------ */

export type Streaks = {
  logging: number;
  longestLogging: number;
  consistency: number;
  totalDaysLogged: number;
};

/**
 * Streaks are generous by design: today not being logged *yet* should not wipe
 * out a run, so the count may start from yesterday.
 */
export function computeStreaks(days: DailyLog[], todayIsoDate: Iso): Streaks {
  const byDate = new Map(days.map((d) => [d.logDate, d]));
  const isLogged = (iso: Iso) => (byDate.get(iso)?.entryCount ?? 0) > 0;
  const isOn = (iso: Iso) => {
    const d = byDate.get(iso);
    return !!d && d.entryCount > 0 && isOnTarget(d.totals.calories, d.targets.calories);
  };

  const countBack = (predicate: (iso: Iso) => boolean) => {
    let cursor = predicate(todayIsoDate) ? todayIsoDate : addDays(todayIsoDate, -1);
    let n = 0;
    while (predicate(cursor) && n < 400) {
      n++;
      cursor = addDays(cursor, -1);
    }
    return n;
  };

  const allDates = [...byDate.keys()].sort();
  let longest = 0;
  let run = 0;
  let prev: Iso | null = null;
  for (const iso of allDates) {
    if (!isLogged(iso)) {
      run = 0;
      prev = iso;
      continue;
    }
    run = prev && diffDays(prev, iso) === 1 && isLogged(prev) ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = iso;
  }

  return {
    logging: countBack(isLogged),
    longestLogging: longest,
    consistency: countBack(isOn),
    totalDaysLogged: allDates.filter(isLogged).length,
  };
}

/* ------------------------------------------------------------------ */
/* Sparkline series                                                    */
/* ------------------------------------------------------------------ */

export type DaySeriesPoint = {
  iso: Iso;
  calories: number;
  target: number;
  protein: number;
  score: number;
  status: DailyLog["status"];
  logged: boolean;
};

export function buildDaySeries(
  days: DailyLog[],
  endIso: Iso,
  length: number,
  fallbackTarget: number,
): DaySeriesPoint[] {
  const byDate = new Map(days.map((d) => [d.logDate, d]));
  return lastNDays(endIso, length).map((iso) => {
    const d = byDate.get(iso);
    return {
      iso,
      calories: d?.totals.calories ?? 0,
      target: d?.targets.calories ?? fallbackTarget,
      protein: d?.totals.protein ?? 0,
      score: d?.score ?? 0,
      status: d?.status ?? "unlogged",
      logged: (d?.entryCount ?? 0) > 0,
    };
  });
}
