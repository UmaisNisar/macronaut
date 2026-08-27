import type {
  ActivityLevel,
  DayStatus,
  Gender,
  Macros,
  Targets,
} from "@/lib/schemas";
import { addDays, type Iso } from "@/lib/date";

/** Energy density of body fat used for rate <-> deficit conversion. */
export const KCAL_PER_KG = 7700;

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
};

export const ACTIVITY_COPY: Record<
  ActivityLevel,
  { label: string; detail: string }
> = {
  sedentary: {
    label: "Sedentary",
    detail: "Desk job, little deliberate exercise",
  },
  light: { label: "Lightly active", detail: "Light movement 1–3 days a week" },
  moderate: {
    label: "Moderately active",
    detail: "Training or hard movement 3–5 days a week",
  },
  very: { label: "Very active", detail: "Hard training 6–7 days a week" },
};

export const emptyMacros = (): Macros => ({
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  fiber: 0,
  sugar: 0,
});

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, places = 0): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

/* ------------------------------------------------------------------ */
/* Energy model                                                        */
/* ------------------------------------------------------------------ */

/**
 * Mifflin-St Jeor. For `other` we take the midpoint of the male and female
 * constants rather than forcing a pick — it is the least-wrong option.
 */
export function basalMetabolicRate(input: {
  weightKg: number;
  heightCm: number;
  age: number;
  gender: Gender;
}): number {
  const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age;
  const constant =
    input.gender === "male" ? 5 : input.gender === "female" ? -161 : -78;
  return Math.max(800, base + constant);
}

/** The lowest daily intake Macronaut will ever recommend. */
function intakeFloor(gender: Gender, bmr: number): number {
  const byGender = gender === "female" ? 1200 : gender === "male" ? 1500 : 1350;
  return Math.max(byGender, bmr * 0.8);
}

export function computeTargets(input: {
  age: number;
  gender: Gender;
  heightCm: number;
  weightKg: number;
  targetWeightKg: number;
  weeklyLossKg: number;
  activityLevel: ActivityLevel;
}): Targets {
  const bmr = basalMetabolicRate(input);
  const tdee = bmr * ACTIVITY_MULTIPLIERS[input.activityLevel];

  const wantedDeficit = (input.weeklyLossKg * KCAL_PER_KG) / 7;
  const floor = intakeFloor(input.gender, bmr);
  const rawTarget = tdee - wantedDeficit;
  const calories = Math.max(floor, rawTarget);
  const deficit = tdee - calories;

  // Protein is anchored near goal weight so it does not balloon at high
  // starting weights, but stays generous enough to protect lean mass.
  const referenceWeight = clamp(
    input.targetWeightKg + 0.25 * (input.weightKg - input.targetWeightKg),
    input.weightKg * 0.55,
    input.weightKg,
  );
  const protein = clamp(1.8 * referenceWeight, 70, 240);

  const fatFromEnergy = (calories * 0.27) / 9;
  const fat = clamp(Math.max(fatFromEnergy, 0.6 * referenceWeight), 35, 140);

  const carbKcal = calories - protein * 4 - fat * 9;
  const carbs = Math.max(60, carbKcal / 4);

  const fiber = clamp((14 * calories) / 1000, 20, 45);

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    calories: Math.round(calories),
    deficit: Math.round(deficit),
    protein: Math.round(protein),
    carbs: Math.round(carbs),
    fat: Math.round(fat),
    fiber: Math.round(fiber),
    deficitClamped: rawTarget < floor - 1,
  };
}

/** Weekly loss rate that the clamped calorie target actually supports. */
export function achievableWeeklyLoss(targets: Targets): number {
  return round((targets.deficit * 7) / KCAL_PER_KG, 2);
}

/* ------------------------------------------------------------------ */
/* Daily score                                                         */
/* ------------------------------------------------------------------ */

export type ScoreBreakdown = {
  fuel: number;
  protein: number;
  logging: number;
  fiber: number;
};

const WEIGHTS = { fuel: 45, protein: 30, logging: 15, fiber: 10 } as const;

function lerp(x: number, x0: number, x1: number, y0: number, y1: number) {
  if (x1 === x0) return y1;
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

/**
 * Energy accuracy. Deliberately forgiving: a wide green band, gentle slopes,
 * and a floor well above zero. A single heavy day should dent a score, not
 * flatten it.
 */
function fuelPoints(ratio: number): number {
  const max = WEIGHTS.fuel;
  if (ratio >= 0.85 && ratio <= 1.05) return max;
  if (ratio < 0.85) {
    if (ratio >= 0.7) return lerp(ratio, 0.7, 0.85, max * 0.68, max);
    if (ratio >= 0.4) return lerp(ratio, 0.4, 0.7, max * 0.3, max * 0.68);
    return max * 0.28;
  }
  if (ratio <= 1.25) return lerp(ratio, 1.05, 1.25, max, max * 0.6);
  if (ratio <= 1.6) return lerp(ratio, 1.25, 1.6, max * 0.6, max * 0.24);
  return max * 0.2;
}

export function scoreDay(input: {
  totals: Macros;
  targets: Targets;
  entryCount: number;
}): { score: number; status: DayStatus; breakdown: ScoreBreakdown } {
  const { totals, targets, entryCount } = input;

  if (entryCount === 0) {
    return {
      score: 0,
      status: "unlogged",
      breakdown: { fuel: 0, protein: 0, logging: 0, fiber: 0 },
    };
  }

  const ratio = targets.calories > 0 ? totals.calories / targets.calories : 0;

  const fuel = fuelPoints(ratio);
  const protein =
    WEIGHTS.protein *
    clamp(totals.protein / Math.max(1, targets.protein) / 0.95, 0, 1);
  const fiber =
    WEIGHTS.fiber * clamp(totals.fiber / Math.max(1, targets.fiber), 0, 1);
  const logging =
    entryCount >= 3 ? WEIGHTS.logging : entryCount >= 2 ? 12 : 9;

  const score = Math.round(fuel + protein + fiber + logging);

  const status: DayStatus =
    score >= 82 ? "great" : score >= 64 ? "solid" : ratio >= 1 ? "over" : "under";

  return {
    score: clamp(score, 0, 100),
    status,
    breakdown: {
      fuel: round(fuel, 1),
      protein: round(protein, 1),
      logging,
      fiber: round(fiber, 1),
    },
  };
}

export const STATUS_META: Record<
  DayStatus,
  { label: string; emoji: string; token: string; blurb: string }
> = {
  great: {
    label: "Great day",
    emoji: "🔥",
    token: "var(--mint)",
    blurb: "Fuelled well and close to target.",
  },
  solid: {
    label: "Solid day",
    emoji: "🙂",
    token: "var(--sky)",
    blurb: "Not perfect, and that is completely fine.",
  },
  over: {
    label: "Went over",
    emoji: "🍕",
    token: "var(--peach)",
    blurb: "More fuel than planned. One day is just one day.",
  },
  under: {
    label: "Ate light",
    emoji: "🌱",
    token: "var(--violet)",
    blurb: "Noticeably under target — worth topping up tomorrow.",
  },
  unlogged: {
    label: "Nothing yet",
    emoji: "💤",
    token: "var(--track)",
    blurb: "Nothing logged for this day.",
  },
};

/** A day counts as "on target" when intake landed inside the comfortable band. */
export function isOnTarget(totalCalories: number, targetCalories: number) {
  if (targetCalories <= 0) return false;
  const r = totalCalories / targetCalories;
  return r >= 0.82 && r <= 1.08;
}

/* ------------------------------------------------------------------ */
/* Weight journey                                                      */
/* ------------------------------------------------------------------ */

export type Journey = {
  startKg: number;
  currentKg: number;
  targetKg: number;
  lostKg: number;
  remainingKg: number;
  totalKg: number;
  percent: number;
  weeksLeft: number | null;
  etaIso: Iso | null;
  reachedGoal: boolean;
};

export function computeJourney(input: {
  startKg: number;
  currentKg: number;
  targetKg: number;
  weeklyLossKg: number;
  fromIsoDate: Iso;
}): Journey {
  const totalKg = Math.max(0, input.startKg - input.targetKg);
  const lostKg = input.startKg - input.currentKg;
  const remainingKg = Math.max(0, input.currentKg - input.targetKg);
  const percent =
    totalKg > 0 ? clamp(lostKg / totalKg, 0, 1) : input.currentKg <= input.targetKg ? 1 : 0;

  const rate = input.weeklyLossKg;
  const weeksLeft = rate > 0.01 && remainingKg > 0 ? remainingKg / rate : null;

  return {
    startKg: round(input.startKg, 1),
    currentKg: round(input.currentKg, 1),
    targetKg: round(input.targetKg, 1),
    lostKg: round(lostKg, 1),
    remainingKg: round(remainingKg, 1),
    totalKg: round(totalKg, 1),
    percent,
    weeksLeft: weeksLeft === null ? null : round(weeksLeft, 1),
    etaIso:
      weeksLeft === null
        ? null
        : addDays(input.fromIsoDate, Math.round(weeksLeft * 7)),
    reachedGoal: remainingKg <= 0.05,
  };
}

/* ------------------------------------------------------------------ */
/* Trends                                                              */
/* ------------------------------------------------------------------ */

export type TrendPoint = { x: number; y: number };

/** Ordinary least squares. `slope` is in y-units per x-unit (x = days). */
export function linearFit(points: TrendPoint[]): {
  slope: number;
  intercept: number;
} | null {
  if (points.length < 2) return null;
  const n = points.length;
  const sx = points.reduce((a, p) => a + p.x, 0);
  const sy = points.reduce((a, p) => a + p.y, 0);
  const sxy = points.reduce((a, p) => a + p.x * p.y, 0);
  const sxx = points.reduce((a, p) => a + p.x * p.x, 0);
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const slope = (n * sxy - sx * sy) / denom;
  return { slope, intercept: (sy - slope * sx) / n };
}

export function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Centred moving average, tolerant of gaps at the edges. */
export function movingAverage(values: number[], window: number): number[] {
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - half), i + half + 1);
    return mean(slice);
  });
}

/* ------------------------------------------------------------------ */
/* Units                                                               */
/* ------------------------------------------------------------------ */

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const lbToKg = (lb: number) => lb * KG_PER_LB;
export const cmToIn = (cm: number) => cm / CM_PER_IN;
export const inToCm = (inches: number) => inches * CM_PER_IN;

export function formatWeight(kg: number, units: "metric" | "imperial") {
  return units === "imperial"
    ? `${round(kgToLb(kg), 1)} lb`
    : `${round(kg, 1)} kg`;
}

export function formatWeightDelta(kg: number, units: "metric" | "imperial") {
  const v = units === "imperial" ? kgToLb(kg) : kg;
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${round(Math.abs(v), 1)} ${units === "imperial" ? "lb" : "kg"}`;
}

export function formatHeight(cm: number, units: "metric" | "imperial") {
  if (units === "metric") return `${Math.round(cm)} cm`;
  const totalIn = cmToIn(cm);
  const ft = Math.floor(totalIn / 12);
  const inch = Math.round(totalIn - ft * 12);
  return inch === 12 ? `${ft + 1}′ 0″` : `${ft}′ ${inch}″`;
}
