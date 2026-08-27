import { NextResponse } from "next/server";

import { getSession, getStore } from "@/lib/session";
import { userToday } from "@/lib/server-date";
import { addDays } from "@/lib/date";
import { consumeAiBudget } from "@/lib/ai/budget";

/**
 * Take your data with you.
 *
 * Months of weigh-ins and meals are worth more than the app around them, and
 * until now they existed in exactly one place. This is a plain export with no
 * lock-in: JSON for everything, CSV for the two tables anyone actually wants to
 * open in a spreadsheet.
 */

export const dynamic = "force-dynamic";

/** RFC 4180: quote everything, double any embedded quotes. */
function csv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\r\n");
}

function download(body: string, filename: string, type: string) {
  return new NextResponse(body, {
    headers: {
      "content-type": `${type}; charset=utf-8`,
      "content-disposition": `attachment; filename="${filename}"`,
      // Someone's food log has no business in a shared cache.
      "cache-control": "no-store, private",
    },
  });
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const store = await getStore();
  const profile = await store.getProfile(session.userId);
  if (!profile) {
    return NextResponse.json({ error: "No profile yet." }, { status: 404 });
  }

  const today = await userToday();

  // Bounded per account: this rebuilds an entire history on every call.
  const budget = await consumeAiBudget(store, profile.id, today, "export");
  if (!budget.ok) {
    return NextResponse.json({ error: budget.message }, { status: 429 });
  }
  // Far enough back to cover any history the app could have.
  const from = addDays(today, -3650);

  const what = new URL(request.url).searchParams.get("what") ?? "all";
  const stamp = today;

  if (what === "food") {
    const entries = await store.listFoodEntries(profile.id, from, today);
    return download(
      csv([
        ["date", "meal", "name", "quantity", "calories", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g", "confidence", "source", "logged_at"],
        ...entries.map((e) => [
          e.logDate, e.meal, e.name, e.quantity, e.calories,
          e.protein, e.carbs, e.fat, e.fiber, e.sugar,
          e.confidence, e.source, e.createdAt,
        ]),
      ]),
      `macronaut-food-${stamp}.csv`,
      "text/csv",
    );
  }

  if (what === "weight") {
    const weights = await store.listWeightLogs(profile.id);
    return download(
      csv([
        ["date", "weight_kg", "note", "logged_at"],
        ...weights.map((w) => [w.loggedOn, w.weightKg, w.note, w.createdAt]),
      ]),
      `macronaut-weight-${stamp}.csv`,
      "text/csv",
    );
  }

  // Everything, in a shape that could be read back in.
  const [goals, entries, days, weights, achievements] = await Promise.all([
    store.listGoalSnapshots(profile.id),
    store.listFoodEntries(profile.id, from, today),
    store.listDailyLogs(profile.id, from, today),
    store.listWeightLogs(profile.id),
    store.listAchievements(profile.id),
  ]);

  return download(
    JSON.stringify(
      {
        exportedOn: stamp,
        app: "macronaut",
        schema: 1,
        profile,
        goalSnapshots: goals,
        foodEntries: entries,
        dailyLogs: days,
        weightLogs: weights,
        achievements,
      },
      null,
      2,
    ),
    `macronaut-export-${stamp}.json`,
    "application/json",
  );
}
