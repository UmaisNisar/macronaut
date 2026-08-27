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
