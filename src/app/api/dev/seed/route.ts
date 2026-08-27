import { NextResponse } from "next/server";

import { getSession, getStore } from "@/lib/session";
import { userToday } from "@/lib/server-date";
import { addDays } from "@/lib/date";
import { computeTargets, round } from "@/lib/nutrition";
import { recomputeDay, refreshAchievements, targetsForDate } from "@/server/core";
import type { NewFoodEntry } from "@/lib/db/store";
import type { MealSlot } from "@/lib/schemas";

/**
 * Development helper: fabricates a realistic 45-day history so the history,
 * progress and insights screens can be judged with something in them. Runs
 * through the real store and the real scoring code — no shortcuts, so what you
 * see is what the app would actually have produced.
 */

export const dynamic = "force-dynamic";

type Template = {
  meal: MealSlot;
  name: string;
  emoji: string;
  quantity: string;
  kcal: number;
  p: number;
  c: number;
  f: number;
  fib: number;
  sug: number;
};

const MENU: Record<MealSlot, Template[]> = {
  breakfast: [
    { meal: "breakfast", name: "Scrambled Eggs on Toast", emoji: "🍳", quantity: "3 eggs, 2 slices", kcal: 420, p: 24, c: 30, f: 22, fib: 3, sug: 3 },
    { meal: "breakfast", name: "Porridge with Banana", emoji: "🥣", quantity: "1 bowl", kcal: 330, p: 11, c: 58, f: 6, fib: 7, sug: 18 },
    { meal: "breakfast", name: "Bacon Sandwich", emoji: "🥪", quantity: "1", kcal: 480, p: 22, c: 42, f: 25, fib: 3, sug: 4 },
    { meal: "breakfast", name: "Greek Yogurt and Berries", emoji: "🍶", quantity: "1 cup", kcal: 210, p: 22, c: 24, f: 2, fib: 5, sug: 16 },
  ],
  lunch: [
    { meal: "lunch", name: "Chicken Caesar Salad", emoji: "🥗", quantity: "1 bowl", kcal: 480, p: 38, c: 18, f: 28, fib: 4, sug: 4 },
    { meal: "lunch", name: "Grilled Chicken and Rice", emoji: "🍗", quantity: "1 plate", kcal: 520, p: 46, c: 55, f: 10, fib: 2, sug: 1 },
    { meal: "lunch", name: "Chicken Burrito", emoji: "🌯", quantity: "1", kcal: 620, p: 34, c: 66, f: 22, fib: 8, sug: 5 },
    { meal: "lunch", name: "Tomato Soup and Bread", emoji: "🥣", quantity: "1 bowl, 2 slices", kcal: 380, p: 12, c: 58, f: 11, fib: 7, sug: 12 },
    { meal: "lunch", name: "Turkey Club Sandwich", emoji: "🥪", quantity: "1", kcal: 590, p: 30, c: 48, f: 30, fib: 4, sug: 6 },
  ],
  dinner: [
    { meal: "dinner", name: "Spaghetti Bolognese", emoji: "🍝", quantity: "1 plate", kcal: 640, p: 32, c: 74, f: 20, fib: 6, sug: 9 },
    { meal: "dinner", name: "Salmon and Vegetables", emoji: "🐟", quantity: "1 fillet", kcal: 420, p: 38, c: 18, f: 22, fib: 6, sug: 6 },
    { meal: "dinner", name: "Pizza", emoji: "🍕", quantity: "3 slices", kcal: 855, p: 36, c: 108, f: 30, fib: 6, sug: 10 },
    { meal: "dinner", name: "Steak and Potatoes", emoji: "🥩", quantity: "200 g steak", kcal: 620, p: 58, c: 37, f: 27, fib: 4, sug: 2 },
    { meal: "dinner", name: "Roast Chicken Dinner", emoji: "🍗", quantity: "1 plate", kcal: 610, p: 44, c: 48, f: 24, fib: 7, sug: 8 },
  ],
  snack: [
    { meal: "snack", name: "Almonds", emoji: "🥜", quantity: "1 handful", kcal: 170, p: 6, c: 6, f: 15, fib: 3, sug: 1 },
    { meal: "snack", name: "Chocolate Bar", emoji: "🍫", quantity: "1 bar", kcal: 230, p: 3, c: 26, f: 13, fib: 1, sug: 24 },
    { meal: "snack", name: "Apple", emoji: "🍎", quantity: "1 medium", kcal: 95, p: 0.5, c: 25, f: 0.3, fib: 4, sug: 19 },
    { meal: "snack", name: "Crisps", emoji: "🥔", quantity: "1 bag", kcal: 300, p: 4, c: 30, f: 19, fib: 2, sug: 1 },
  ],
  drink: [
    { meal: "drink", name: "Protein Shake", emoji: "🥤", quantity: "1 scoop", kcal: 130, p: 25, c: 4, f: 2, fib: 1, sug: 2 },
    { meal: "drink", name: "Diet Coke", emoji: "🥤", quantity: "1 can", kcal: 1, p: 0, c: 0.3, f: 0, fib: 0, sug: 0 },
    { meal: "drink", name: "Latte", emoji: "☕", quantity: "1", kcal: 190, p: 10, c: 18, f: 7, fib: 0, sug: 17 },
    { meal: "drink", name: "Black Coffee", emoji: "☕", quantity: "1 cup", kcal: 5, p: 0.3, c: 0, f: 0, fib: 0, sug: 0 },
  ],
};

/** Deterministic PRNG so re-seeding produces the same demo history. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Seeding is disabled in production." },
      { status: 403 },
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No session." }, { status: 401 });
  }

  const store = await getStore();
  const today = await userToday();
  const random = rng(20260826);

  await store.wipeUser(session.userId);

  const DAYS = 45;
  const startWeight = 98.4;

  const profile = await store.saveProfile({
    id: session.userId,
    email: session.email,
    displayName: "Demo Pilot",
    age: 31,
    gender: "male",
    heightCm: 178,
    startingWeightKg: startWeight,
    currentWeightKg: startWeight,
    targetWeightKg: 82,
    weeklyLossKg: 0.5,
    activityLevel: "light",
    units: "metric",
    onboardedAt: new Date().toISOString(),
  });

  await store.insertGoalSnapshot({
    userId: profile.id,
    effectiveFrom: addDays(today, -(DAYS - 1)),
    age: 31,
    gender: "male",
    heightCm: 178,
    weightKg: startWeight,
    targetWeightKg: 82,
    weeklyLossKg: 0.5,
    activityLevel: "light",
    targets: computeTargets({
      age: 31,
      gender: "male",
      heightCm: 178,
      weightKg: startWeight,
      targetWeightKg: 82,
      weeklyLossKg: 0.5,
      activityLevel: "light",
    }),
  });

  const goals = await store.listGoalSnapshots(profile.id);
  const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)];

  let latestWeight = startWeight;
  let daysLogged = 0;

  for (let offset = DAYS - 1; offset >= 0; offset--) {
    const date = addDays(today, -offset);
    const progress = 1 - offset / (DAYS - 1); // 0 at the start, 1 today
    const weekday = new Date(date).getDay();
    const isWeekend = weekday === 0 || weekday === 6;

    // Consistency improves over the period, with the odd missed day.
    const logChance = 0.62 + progress * 0.35;
    if (random() > logChance) continue;
    daysLogged++;

    const templates: Template[] = [
      pick(MENU.breakfast),
      pick(MENU.lunch),
      pick(MENU.dinner),
    ];
    if (random() < 0.75) templates.push(pick(MENU.snack));
    if (random() < 0.85) templates.push(pick(MENU.drink));
    // Weekends drift heavier early on and settle down later.
    if (isWeekend && random() < 0.7 - progress * 0.4) {
      templates.push(pick(MENU.snack));
    }
    // Protein habit builds over time.
    if (random() < 0.25 + progress * 0.5) templates.push(MENU.drink[0]);

    const scale = 1.08 - progress * 0.16 + (random() - 0.5) * 0.1;

    const entries: NewFoodEntry[] = templates.map((t) => ({
      userId: profile.id,
      logDate: date,
      meal: t.meal,
      name: t.name,
      quantity: t.quantity,
      emoji: t.emoji,
      calories: Math.round(t.kcal * scale),
      protein: round(t.p * scale, 1),
      carbs: round(t.c * scale, 1),
      fat: round(t.f * scale, 1),
      fiber: round(t.fib * scale, 1),
      sugar: round(t.sug * scale, 1),
      confidence: "medium" as const,
      assumptions: [],
      rawInput: `${t.quantity} ${t.name.toLowerCase()}`,
      source: "ai" as const,
    }));

    await store.insertFoodEntries(entries);
    await recomputeDay(
      store,
      profile.id,
      date,
      targetsForDate(goals, profile, date),
    );

    // A reading every few days, trending down with normal daily noise.
    if (offset % 3 === 0 || random() < 0.2) {
      const trend = startWeight - (DAYS - offset) * (0.5 / 7);
      latestWeight = round(trend + (random() - 0.5) * 0.9, 1);
      await store.upsertWeightLog(profile.id, date, latestWeight, null);
    }
  }

  await store.patchProfile(profile.id, { currentWeightKg: latestWeight });
  await refreshAchievements(
    store,
    { ...profile, currentWeightKg: latestWeight },
    today,
  );

  return NextResponse.json({
    ok: true,
    daysGenerated: daysLogged,
    from: addDays(today, -(DAYS - 1)),
    to: today,
    latestWeight,
  });
}
