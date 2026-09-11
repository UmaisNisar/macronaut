import type { SupabaseClient } from "@supabase/supabase-js";

import type { Iso } from "@/lib/date";
import type {
  Achievement,
  AiCoachNote,
  AiPeriodReport,
  AiWeightNote,
  DailyLog,
  DayStatus,
  FoodEntry,
  GoalSnapshot,
  Profile,
  ReportPeriod,
  StoredReport,
  Targets,
  WeightLog,
} from "@/lib/schemas";
import type {
  DailyLogPatch,
  DataStore,
  NewFoodEntry,
  NewGoalSnapshot,
  ProfileSeed,
} from "@/lib/db/store";
import type { PushSub } from "@/lib/db/store";
import { rankFrequentFoods } from "@/lib/db/store";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const num = (v: unknown, fallback = 0) => {
  const n = typeof v === "string" ? Number.parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : fallback;
};

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`${context}: ${error?.message ?? "unknown error"}`);
}

/* ------------------------------ row mappers ----------------------------- */

function toProfile(r: Row): Profile {
  return {
    id: r.id,
    email: r.email ?? null,
    displayName: r.display_name ?? null,
    age: num(r.age, 30),
    gender: r.gender,
    heightCm: num(r.height_cm, 170),
    startingWeightKg: num(r.starting_weight_kg),
    currentWeightKg: num(r.current_weight_kg),
    targetWeightKg: num(r.target_weight_kg),
    weeklyLossKg: num(r.weekly_loss_kg, 0.5),
    activityLevel: r.activity_level,
    units: r.units,
    onboardedAt: r.onboarded_at ?? null,
    reminderHour:
      typeof r.reminder_hour === "number" ? r.reminder_hour : null,
    timeZone: r.time_zone ?? null,
    createdAt: r.created_at,
  };
}

function fromProfile(p: ProfileSeed): Row {
  return {
    id: p.id,
    email: p.email,
    display_name: p.displayName,
    age: p.age,
    gender: p.gender,
    height_cm: p.heightCm,
    starting_weight_kg: p.startingWeightKg,
    current_weight_kg: p.currentWeightKg,
    target_weight_kg: p.targetWeightKg,
    weekly_loss_kg: p.weeklyLossKg,
    activity_level: p.activityLevel,
    units: p.units,
    onboarded_at: p.onboardedAt,
  };
}

const PROFILE_COLUMN: Record<string, string> = {
  email: "email",
  displayName: "display_name",
  age: "age",
  gender: "gender",
  heightCm: "height_cm",
  startingWeightKg: "starting_weight_kg",
  currentWeightKg: "current_weight_kg",
  targetWeightKg: "target_weight_kg",
  weeklyLossKg: "weekly_loss_kg",
  activityLevel: "activity_level",
  units: "units",
  onboardedAt: "onboarded_at",
};

function toGoal(r: Row): GoalSnapshot {
  return {
    id: r.id,
    userId: r.user_id,
    effectiveFrom: r.effective_from,
    age: num(r.age),
    gender: r.gender,
    heightCm: num(r.height_cm),
    weightKg: num(r.weight_kg),
    targetWeightKg: num(r.target_weight_kg),
    weeklyLossKg: num(r.weekly_loss_kg),
    activityLevel: r.activity_level,
    targets: r.targets as Targets,
    createdAt: r.created_at,
  };
}

function toFood(r: Row): FoodEntry {
  return {
    id: r.id,
    userId: r.user_id,
    logDate: r.log_date,
    meal: r.meal,
    name: r.name,
    quantity: r.quantity,
    emoji: r.emoji,
    calories: num(r.calories),
    protein: num(r.protein),
    carbs: num(r.carbs),
    fat: num(r.fat),
    fiber: num(r.fiber),
    sugar: num(r.sugar),
    confidence: r.confidence,
    assumptions: r.assumptions ?? [],
    alternatives: r.alternatives ?? [],
    rawInput: r.raw_input ?? "",
    source: r.source,
    createdAt: r.created_at,
  };
}

function fromFood(e: NewFoodEntry): Row {
  return {
    user_id: e.userId,
    log_date: e.logDate,
    meal: e.meal,
    name: e.name,
    quantity: e.quantity,
    emoji: e.emoji,
    calories: e.calories,
    protein: e.protein,
    carbs: e.carbs,
    fat: e.fat,
    fiber: e.fiber,
    sugar: e.sugar,
    confidence: e.confidence,
    assumptions: e.assumptions,
    alternatives: e.alternatives ?? [],
    raw_input: e.rawInput,
    source: e.source,
  };
}

const FOOD_COLUMN: Record<string, string> = {
  logDate: "log_date",
  meal: "meal",
  name: "name",
  quantity: "quantity",
  emoji: "emoji",
  calories: "calories",
  protein: "protein",
  carbs: "carbs",
  fat: "fat",
  fiber: "fiber",
  sugar: "sugar",
  confidence: "confidence",
  assumptions: "assumptions",
  alternatives: "alternatives",
  rawInput: "raw_input",
  source: "source",
};

function toDaily(r: Row): DailyLog {
  return {
    id: r.id,
    userId: r.user_id,
    logDate: r.log_date,
    targets: {
      bmr: num(r.bmr),
      tdee: num(r.tdee),
      calories: num(r.calorie_target),
      deficit: num(r.deficit),
      protein: num(r.protein_target),
      carbs: num(r.carb_target),
      fat: num(r.fat_target),
      fiber: num(r.fiber_target),
      // daily_logs has no sugar_target column, and does not need one: the
      // ceiling is a pure function of the calorie target already stored
      // here. Deriving it avoids a migration and keeps old rows consistent.
      sugar: Math.round((num(r.calorie_target) * 0.1) / 4),
      deficitClamped: Boolean(r.deficit_clamped),
    },
    totals: {
      calories: num(r.total_calories),
      protein: num(r.total_protein),
      carbs: num(r.total_carbs),
      fat: num(r.total_fat),
      fiber: num(r.total_fiber),
      sugar: num(r.total_sugar),
    },
    entryCount: num(r.entry_count),
    score: num(r.score),
    status: r.status as DayStatus,
    coach: (r.coach as AiCoachNote | null) ?? null,
    coachGeneratedAt: r.coach_generated_at ?? null,
    coachSignature: r.coach_signature ?? null,
  };
}

function fromDaily(userId: string, dateIso: Iso, p: DailyLogPatch): Row {
  return {
    user_id: userId,
    log_date: dateIso,
    bmr: Math.round(p.targets.bmr),
    tdee: Math.round(p.targets.tdee),
    deficit: Math.round(p.targets.deficit),
    deficit_clamped: p.targets.deficitClamped,
    calorie_target: Math.round(p.targets.calories),
    protein_target: Math.round(p.targets.protein),
    carb_target: Math.round(p.targets.carbs),
    fat_target: Math.round(p.targets.fat),
    fiber_target: Math.round(p.targets.fiber),
    total_calories: p.totals.calories,
    total_protein: p.totals.protein,
    total_carbs: p.totals.carbs,
    total_fat: p.totals.fat,
    total_fiber: p.totals.fiber,
    total_sugar: p.totals.sugar,
    entry_count: p.entryCount,
    score: Math.round(p.score),
    status: p.status,
    coach: p.coach,
    coach_generated_at: p.coachGeneratedAt,
    coach_signature: p.coachSignature,
    updated_at: new Date().toISOString(),
  };
}

function toWeight(r: Row): WeightLog {
  return {
    id: r.id,
    userId: r.user_id,
    loggedOn: r.logged_on,
    weightKg: num(r.weight_kg),
    note: r.note ?? null,
    coach: (r.coach as AiWeightNote | null) ?? null,
    createdAt: r.created_at,
  };
}

function toReport(r: Row): StoredReport {
  return {
    id: r.id,
    userId: r.user_id,
    period: r.period as ReportPeriod,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    signature: r.signature,
    report: r.report as AiPeriodReport,
    createdAt: r.created_at,
  };
}

/* -------------------------------- driver -------------------------------- */

export function createSupabaseStore(sb: SupabaseClient): DataStore {
  return {
    kind: "supabase",

    async getProfile(userId) {
      const { data, error } = await sb
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (error) fail("load profile", error);
      return data ? toProfile(data) : null;
    },

    async saveProfile(profile) {
      const { data, error } = await sb
        .from("profiles")
        .upsert(fromProfile(profile), { onConflict: "id" })
        .select("*")
        .single();
      if (error) fail("save profile", error);
      return toProfile(data);
    },

    async patchProfile(userId, patch) {
      const row: Row = {};
      for (const [key, value] of Object.entries(patch)) {
        const column = PROFILE_COLUMN[key];
        if (column) row[column] = value;
      }
      const { data, error } = await sb
        .from("profiles")
        .update(row)
        .eq("id", userId)
        .select("*")
        .single();
      if (error) fail("update profile", error);
      return toProfile(data);
    },

    async listGoalSnapshots(userId) {
      const { data, error } = await sb
        .from("goal_snapshots")
        .select("*")
        .eq("user_id", userId)
        .order("effective_from", { ascending: true });
      if (error) fail("load goals", error);
      return (data ?? []).map(toGoal);
    },

    async insertGoalSnapshot(snapshot: NewGoalSnapshot) {
      const { data, error } = await sb
        .from("goal_snapshots")
        .upsert(
          {
            user_id: snapshot.userId,
            effective_from: snapshot.effectiveFrom,
            age: snapshot.age,
            gender: snapshot.gender,
            height_cm: snapshot.heightCm,
            weight_kg: snapshot.weightKg,
            target_weight_kg: snapshot.targetWeightKg,
            weekly_loss_kg: snapshot.weeklyLossKg,
            activity_level: snapshot.activityLevel,
            targets: snapshot.targets,
          },
          { onConflict: "user_id,effective_from" },
        )
        .select("*")
        .single();
      if (error) fail("save goal snapshot", error);
      return toGoal(data);
    },

    async listFoodEntries(userId, startIso, endIso) {
      const { data, error } = await sb
        .from("food_entries")
        .select("*")
        .eq("user_id", userId)
        .gte("log_date", startIso)
        .lte("log_date", endIso)
        .order("created_at", { ascending: true });
      if (error) fail("load food", error);
      return (data ?? []).map(toFood);
    },

    async bumpAiUsage(_userId, dateIso, kind) {
      // The user comes from auth.uid() inside the function, not from us.
      const { data, error } = await sb.rpc("bump_ai_usage_totals", {
        p_kind: kind,
        p_date: dateIso,
      });
      if (error) fail("record ai usage", error);
      // A set-returning function comes back as an array of one row.
      const row = Array.isArray(data) ? data[0] : data;
      return {
        user: Number(row?.user_count ?? 0),
        global: Number(row?.global_count ?? 0),
      };
    },

    async savePushSubscription(userId, sub) {
      const { error } = await sb.from("push_subscriptions").upsert(
        {
          endpoint: sub.endpoint,
          user_id: userId,
          p256dh: sub.p256dh,
          auth: sub.auth,
          failed_at: null,
        },
        { onConflict: "endpoint" },
      );
      if (error) fail("save push subscription", error);
    },

    async deletePushSubscription(endpoint) {
      const { error } = await sb
        .from("push_subscriptions")
        .delete()
        .eq("endpoint", endpoint);
      if (error) fail("remove push subscription", error);
    },

    async listReminderCandidates() {
      // Reads across accounts, so it is only ever called from the cron route
      // with the service key — the anon client's RLS would return nothing.
      // !inner so the database drops profiles with no subscription rather
      // than returning them for the filter below to throw away. Nothing to
      // notify is the common case, and this is the query that kept timing
      // out at the gateway.
      const { data, error } = await sb
        .from("profiles")
        .select(
          "id, display_name, reminder_hour, time_zone, push_subscriptions!inner(endpoint, p256dh, auth)",
        )
        .not("reminder_hour", "is", null)
        .not("time_zone", "is", null);
      if (error) fail("load reminder candidates", error);

      return (data ?? [])
        .map((row) => ({
          userId: row.id as string,
          displayName: (row.display_name as string | null) ?? null,
          reminderHour: row.reminder_hour as number,
          timeZone: row.time_zone as string,
          subscriptions: ((row.push_subscriptions ?? []) as PushSub[]).map((s) => ({
            endpoint: s.endpoint,
            p256dh: s.p256dh,
            auth: s.auth,
          })),
        }))
        .filter((c) => c.subscriptions.length > 0);
    },

    async listErrors(userId, limit) {
      const { data, error } = await sb
        .from("error_log")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) fail("load errors", error);
      return (data ?? []).map((r) => ({
        id: r.id as string,
        source: r.source as "client" | "server",
        kind: r.kind as string,
        message: r.message as string,
        detail: (r.detail as string | null) ?? null,
        path: (r.path as string | null) ?? null,
        createdAt: r.created_at as string,
      }));
    },

    async searchFoodEntries(userId, query, limit) {
      // Escape the LIKE wildcards so searching for "100%" is a search, not a
      // pattern that matches everything.
      const safe = query.replace(/[%_\\]/g, (c) => `\\${c}`);
      const { data, error } = await sb
        .from("food_entries")
        .select("*")
        .eq("user_id", userId)
        .ilike("name", `%${safe}%`)
        .order("log_date", { ascending: false })
        .limit(limit);
      if (error) fail("search food", error);
      return (data ?? []).map(toFood);
    },

    async listFoodCorrections(userId) {
      const { data, error } = await sb
        .from("food_corrections")
        .select("*")
        .eq("user_id", userId);
      if (error) fail("load corrections", error);
      return (data ?? []).map((row) => ({
        nameKey: row.name_key as string,
        name: row.name as string,
        quantity: row.quantity as string,
        calories: Number(row.calories),
        protein: Number(row.protein),
        carbs: Number(row.carbs),
        fat: Number(row.fat),
        fiber: Number(row.fiber),
        sugar: Number(row.sugar),
        times: Number(row.times),
        updatedAt: row.updated_at as string,
      }));
    },

    async saveFoodCorrection(userId, c) {
      const { error } = await sb.from("food_corrections").upsert(
        {
          user_id: userId,
          name_key: c.nameKey,
          name: c.name,
          quantity: c.quantity,
          calories: c.calories,
          protein: c.protein,
          carbs: c.carbs,
          fat: c.fat,
          fiber: c.fiber,
          sugar: c.sugar,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,name_key" },
      );
      if (error) fail("save correction", error);
    },

    async recordError(_userId, report) {
      const { error } = await sb.rpc("record_error", {
        p_source: report.source,
        p_kind: report.kind,
        p_message: report.message,
        p_detail: report.detail ?? null,
        p_path: report.path ?? null,
      });
      // Swallowed on purpose: a failure to report a failure is not worth
      // turning into a second failure in front of the user.
      if (error) console.warn("[macronaut] could not record error:", error.message);
    },

    async getFoodEntry(userId, id) {
      const { data, error } = await sb
        .from("food_entries")
        .select("*")
        .eq("user_id", userId)
        .eq("id", id)
        .maybeSingle();
      if (error) fail("load food entry", error);
      return data ? toFood(data) : null;
    },

    async listFrequentFoods(userId, limit) {
      // A recent window rather than all history: what you ate six months ago
      // is not what you want offered as a one-tap repeat today.
      const { data, error } = await sb
        .from("food_entries")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) fail("load frequent foods", error);
      return rankFrequentFoods((data ?? []).map(toFood), limit);
    },

    async insertFoodEntries(entries) {
      if (!entries.length) return [];
      const { data, error } = await sb
        .from("food_entries")
        .insert(entries.map(fromFood))
        .select("*");
      if (error) fail("save food", error);
      return (data ?? []).map(toFood);
    },

    async updateFoodEntry(userId, id, patch) {
      const row: Row = {};
      for (const [key, value] of Object.entries(patch)) {
        const column = FOOD_COLUMN[key];
        if (column) row[column] = value;
      }
      const { data, error } = await sb
        .from("food_entries")
        .update(row)
        .eq("id", id)
        .eq("user_id", userId)
        .select("*")
        .maybeSingle();
      if (error) fail("update food", error);
      return data ? toFood(data) : null;
    },

    async deleteFoodEntry(userId, id) {
      const { error } = await sb
        .from("food_entries")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      if (error) fail("delete food", error);
    },

    async getDailyLog(userId, dateIso) {
      const { data, error } = await sb
        .from("daily_logs")
        .select("*")
        .eq("user_id", userId)
        .eq("log_date", dateIso)
        .maybeSingle();
      if (error) fail("load day", error);
      return data ? toDaily(data) : null;
    },

    async listDailyLogs(userId, startIso, endIso) {
      const { data, error } = await sb
        .from("daily_logs")
        .select("*")
        .eq("user_id", userId)
        .gte("log_date", startIso)
        .lte("log_date", endIso)
        .order("log_date", { ascending: true });
      if (error) fail("load days", error);
      return (data ?? []).map(toDaily);
    },

    async upsertDailyLog(userId, dateIso, patch) {
      const { data, error } = await sb
        .from("daily_logs")
        .upsert(fromDaily(userId, dateIso, patch), {
          onConflict: "user_id,log_date",
        })
        .select("*")
        .single();
      if (error) fail("save day", error);
      return toDaily(data);
    },

    async listWeightLogs(userId) {
      const { data, error } = await sb
        .from("weight_logs")
        .select("*")
        .eq("user_id", userId)
        .order("logged_on", { ascending: true });
      if (error) fail("load weights", error);
      return (data ?? []).map(toWeight);
    },

    async upsertWeightLog(userId, dateIso, weightKg, note) {
      const { data, error } = await sb
        .from("weight_logs")
        .upsert(
          {
            user_id: userId,
            logged_on: dateIso,
            weight_kg: weightKg,
            note,
            coach: null,
          },
          { onConflict: "user_id,logged_on" },
        )
        .select("*")
        .single();
      if (error) fail("save weight", error);
      return toWeight(data);
    },

    async setWeightCoach(userId, id, coach) {
      const { error } = await sb
        .from("weight_logs")
        .update({ coach })
        .eq("id", id)
        .eq("user_id", userId);
      if (error) fail("save weight coach", error);
    },

    async deleteWeightLog(userId, id) {
      const { error } = await sb
        .from("weight_logs")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      if (error) fail("delete weight", error);
    },

    async listAchievements(userId) {
      const { data, error } = await sb
        .from("achievements")
        .select("key, unlocked_on")
        .eq("user_id", userId);
      if (error) fail("load achievements", error);
      return (data ?? []).map(
        (r: Row): Achievement => ({ key: r.key, unlockedOn: r.unlocked_on }),
      );
    },

    async unlockAchievements(userId, keys, onIso) {
      if (!keys.length) return [];
      const { data, error } = await sb
        .from("achievements")
        .upsert(
          keys.map((key) => ({ user_id: userId, key, unlocked_on: onIso })),
          { onConflict: "user_id,key", ignoreDuplicates: true },
        )
        .select("key, unlocked_on");
      if (error) fail("unlock achievements", error);
      return (data ?? []).map(
        (r: Row): Achievement => ({ key: r.key, unlockedOn: r.unlocked_on }),
      );
    },

    async getReport(userId, period, signature) {
      const { data, error } = await sb
        .from("ai_reports")
        .select("*")
        .eq("user_id", userId)
        .eq("period", period)
        .eq("signature", signature)
        .maybeSingle();
      if (error) fail("load report", error);
      return data ? toReport(data) : null;
    },

    async saveReport(input) {
      const { data, error } = await sb
        .from("ai_reports")
        .upsert(
          {
            user_id: input.userId,
            period: input.period,
            period_start: input.periodStart,
            period_end: input.periodEnd,
            signature: input.signature,
            report: input.report,
          },
          { onConflict: "user_id,period" },
        )
        .select("*")
        .single();
      if (error) fail("save report", error);
      return toReport(data);
    },

    async wipeUser(userId) {
      for (const table of [
        "ai_reports",
        "achievements",
        "weight_logs",
        "food_entries",
        "daily_logs",
        "goal_snapshots",
      ]) {
        const { error } = await sb.from(table).delete().eq("user_id", userId);
        if (error) fail(`wipe ${table}`, error);
      }
      const { error } = await sb.from("profiles").delete().eq("id", userId);
      if (error) fail("wipe profile", error);
    },
  };
}
