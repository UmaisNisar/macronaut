import type {
  Achievement,
  AiPeriodReport,
  DailyLog,
  FoodEntry,
  GoalSnapshot,
  Profile,
  ReportPeriod,
  StoredReport,
  WeightLog,
} from "@/lib/schemas";
import type { Iso } from "@/lib/date";

export type NewFoodEntry = Omit<FoodEntry, "id" | "createdAt">;

/**
 * What the daily meter counts. Started as model calls; now also covers the two
 * endpoints expensive enough to be worth bounding per account.
 */
export type AiKind =
  | "food"
  | "photo"
  | "coach"
  | "report"
  | "export"
  | "error";

/** What this person's version of a food actually is. */
export type FoodCorrection = {
  /** Normalised name, the key a future log is matched against. */
  nameKey: string;
  name: string;
  quantity: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  times: number;
  updatedAt: string;
};

/** One place decides what counts as "the same food". */
/**
 * What one recorded call cost, from two angles.
 *
 * `user` is this account's running total for the day. `global` is every
 * account's, for the kinds that actually reach a model — the number that
 * says whether the service as a whole is being drained.
 */
export type AiUsageCounts = { user: number; global: number };

export function foodKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export type PushSub = { endpoint: string; p256dh: string; auth: string };

/** One person plus their devices, for the reminder job. */
export type ReminderCandidate = {
  userId: string;
  displayName: string | null;
  reminderHour: number;
  timeZone: string;
  subscriptions: PushSub[];
};

export type LoggedError = {
  id: string;
  source: "client" | "server";
  kind: string;
  message: string;
  detail: string | null;
  path: string | null;
  createdAt: string;
};

export type ErrorReport = {
  source: "client" | "server";
  kind: string;
  message: string;
  detail?: string | null;
  path?: string | null;
};

/** A food worth offering as a one-tap repeat. */
export type FrequentFood = {
  /** Latest entry with this name; the row that gets copied. */
  entryId: string;
  name: string;
  emoji: string;
  quantity: string;
  calories: number;
  /** How many times it has been logged in the window we looked at. */
  count: number;
  lastLoggedOn: Iso;
};
export type NewGoalSnapshot = Omit<GoalSnapshot, "id" | "createdAt">;
export type ProfileSeed = Omit<Profile, "createdAt">;

export type DailyLogPatch = Omit<DailyLog, "id" | "userId" | "logDate">;

/**
 * Everything the app needs from persistence, in one place. Two drivers
 * implement it: Postgres via Supabase, and a local JSON file for solo mode.
 */
export interface DataStore {
  readonly kind: "supabase" | "local";

  /* profile ------------------------------------------------------- */
  getProfile(userId: string): Promise<Profile | null>;
  saveProfile(profile: ProfileSeed): Promise<Profile>;
  patchProfile(
    userId: string,
    patch: Partial<Omit<Profile, "id" | "createdAt">>,
  ): Promise<Profile>;

  /* goals --------------------------------------------------------- */
  listGoalSnapshots(userId: string): Promise<GoalSnapshot[]>;
  insertGoalSnapshot(snapshot: NewGoalSnapshot): Promise<GoalSnapshot>;

  /* food ---------------------------------------------------------- */
  listFoodEntries(
    userId: string,
    startIso: Iso,
    endIso: Iso,
  ): Promise<FoodEntry[]>;
  insertFoodEntries(entries: NewFoodEntry[]): Promise<FoodEntry[]>;
  updateFoodEntry(
    userId: string,
    id: string,
    patch: Partial<Omit<FoodEntry, "id" | "userId" | "createdAt">>,
  ): Promise<FoodEntry | null>;
  deleteFoodEntry(userId: string, id: string): Promise<void>;
  /**
   * The foods this user logs most often, most-used first, each carrying the id
   * of its latest occurrence so it can be copied without re-running the model.
   */
  listFrequentFoods(userId: string, limit: number): Promise<FrequentFood[]>;
  getFoodEntry(userId: string, id: string): Promise<FoodEntry | null>;

  /* ai budget ------------------------------------------------------ */
  /**
   * Atomically record one model call and return the running total for the day.
   * Atomic on purpose: read-then-write would let concurrent requests both see
   * the same count and walk straight past the limit.
   */
  bumpAiUsage(
    userId: string,
    dateIso: Iso,
    kind: AiKind,
  ): Promise<AiUsageCounts>;

  /* diagnostics ---------------------------------------------------- */
  /** Best-effort. Reporting a failure must never itself throw. */
  recordError(userId: string, report: ErrorReport): Promise<void>;
  /** Most recent first, so a problem can actually be looked at. */
  listErrors(userId: string, limit: number): Promise<LoggedError[]>;

  /** Find past meals by name, newest first. */
  searchFoodEntries(
    userId: string,
    query: string,
    limit: number,
  ): Promise<FoodEntry[]>;

  /* learned corrections -------------------------------------------- */
  listFoodCorrections(userId: string): Promise<FoodCorrection[]>;

  /* reminders ------------------------------------------------------ */
  savePushSubscription(userId: string, sub: PushSub): Promise<void>;
  deletePushSubscription(endpoint: string): Promise<void>;
  /** Everyone who could be nudged right now. Cron-only, so it crosses users. */
  listReminderCandidates(): Promise<ReminderCandidate[]>;
  saveFoodCorrection(
    userId: string,
    correction: Omit<FoodCorrection, "times" | "updatedAt">,
  ): Promise<void>;

  /* daily rollups -------------------------------------------------- */
  getDailyLog(userId: string, dateIso: Iso): Promise<DailyLog | null>;
  listDailyLogs(
    userId: string,
    startIso: Iso,
    endIso: Iso,
  ): Promise<DailyLog[]>;
  upsertDailyLog(
    userId: string,
    dateIso: Iso,
    patch: DailyLogPatch,
  ): Promise<DailyLog>;

  /* weight --------------------------------------------------------- */
  listWeightLogs(userId: string): Promise<WeightLog[]>;
  upsertWeightLog(
    userId: string,
    dateIso: Iso,
    weightKg: number,
    note: string | null,
  ): Promise<WeightLog>;
  setWeightCoach(
    userId: string,
    id: string,
    coach: WeightLog["coach"],
  ): Promise<void>;
  deleteWeightLog(userId: string, id: string): Promise<void>;

  /* achievements ---------------------------------------------------- */
  listAchievements(userId: string): Promise<Achievement[]>;
  unlockAchievements(
    userId: string,
    keys: string[],
    onIso: Iso,
  ): Promise<Achievement[]>;

  /* cached reports --------------------------------------------------- */
  getReport(
    userId: string,
    period: ReportPeriod,
    signature: string,
  ): Promise<StoredReport | null>;
  saveReport(input: {
    userId: string;
    period: ReportPeriod;
    periodStart: Iso;
    periodEnd: Iso;
    signature: string;
    report: AiPeriodReport;
  }): Promise<StoredReport>;

  /* danger zone ------------------------------------------------------ */
  wipeUser(userId: string): Promise<void>;
}

/**
 * Rank logged foods into repeat suggestions. Shared so both drivers agree on
 * what "frequent" means: how often you have eaten it, with recency breaking
 * ties, keyed on the name so "Scrambled Eggs" logged ten times is one chip.
 */
export function rankFrequentFoods(
  entries: FoodEntry[],
  limit: number,
): FrequentFood[] {
  const byName = new Map<string, { latest: FoodEntry; count: number }>();

  for (const entry of entries) {
    const key = entry.name.trim().toLowerCase();
    const seen = byName.get(key);
    if (!seen) {
      byName.set(key, { latest: entry, count: 1 });
      continue;
    }
    seen.count += 1;
    if (entry.createdAt > seen.latest.createdAt) seen.latest = entry;
  }

  return [...byName.values()]
    .sort(
      (a, b) =>
        b.count - a.count ||
        b.latest.createdAt.localeCompare(a.latest.createdAt),
    )
    .slice(0, limit)
    .map(({ latest, count }) => ({
      entryId: latest.id,
      name: latest.name,
      emoji: latest.emoji,
      quantity: latest.quantity,
      calories: latest.calories,
      count,
      lastLoggedOn: latest.logDate,
    }));
}
