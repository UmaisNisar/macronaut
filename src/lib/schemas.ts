import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const ACTIVITY_LEVELS = [
  "sedentary",
  "light",
  "moderate",
  "very",
] as const;
export const ActivityLevel = z.enum(ACTIVITY_LEVELS);
export type ActivityLevel = z.infer<typeof ActivityLevel>;

export const GENDERS = ["male", "female", "other"] as const;
export const Gender = z.enum(GENDERS);
export type Gender = z.infer<typeof Gender>;

export const MEAL_SLOTS = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "drink",
] as const;
export const MealSlot = z.enum(MEAL_SLOTS);
export type MealSlot = z.infer<typeof MealSlot>;

export const CONFIDENCES = ["high", "medium", "low"] as const;
export const Confidence = z.enum(CONFIDENCES);
export type Confidence = z.infer<typeof Confidence>;

export const UNITS = ["metric", "imperial"] as const;
export const UnitSystem = z.enum(UNITS);
export type UnitSystem = z.infer<typeof UnitSystem>;

export const DAY_STATUSES = [
  "great",
  "solid",
  "over",
  "under",
  "unlogged",
] as const;
export const DayStatus = z.enum(DAY_STATUSES);
export type DayStatus = z.infer<typeof DayStatus>;

/** ISO calendar day, `YYYY-MM-DD`. Every day-scoped row is keyed by this. */
export const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date");

/* ------------------------------------------------------------------ */
/* Profile + goals                                                     */
/* ------------------------------------------------------------------ */

const OnboardingFields = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  age: z.coerce.number().int().min(13).max(100),
  gender: Gender,
  heightCm: z.coerce.number().min(120).max(250),
  currentWeightKg: z.coerce.number().min(30).max(400),
  targetWeightKg: z.coerce.number().min(30).max(400),
  weeklyLossKg: z.coerce.number().min(0).max(1.5),
  activityLevel: ActivityLevel,
  units: UnitSystem.default("metric"),
});

export const OnboardingInput = OnboardingFields.refine(
  (v) => v.targetWeightKg <= v.currentWeightKg + 0.001,
  {
    message:
      "Macronaut is tuned for fat loss — target should not exceed current weight.",
    path: ["targetWeightKg"],
  },
);
export type OnboardingInput = z.infer<typeof OnboardingInput>;

export const ProfileUpdateInput = OnboardingFields.partial();
export type ProfileUpdateInput = z.infer<typeof ProfileUpdateInput>;

export const Targets = z.object({
  bmr: z.number(),
  tdee: z.number(),
  calories: z.number(),
  deficit: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  fiber: z.number(),
  /**
   * Defaulted, because targets are stored as JSON on every goal snapshot and
   * the ones written before sugar was tracked have no such key. A zero here
   * means "not recorded", and targetsForDate derives one rather than showing a
   * target of nothing.
   */
  sugar: z.number().default(0),
  /** True when the raw deficit was clamped to keep intake at a safe floor. */
  deficitClamped: z.boolean(),
});
export type Targets = z.infer<typeof Targets>;

export const Profile = z.object({
  id: z.string(),
  email: z.string().nullable(),
  displayName: z.string().nullable(),
  age: z.number(),
  gender: Gender,
  heightCm: z.number(),
  startingWeightKg: z.number(),
  currentWeightKg: z.number(),
  targetWeightKg: z.number(),
  weeklyLossKg: z.number(),
  activityLevel: ActivityLevel,
  units: UnitSystem,
  onboardedAt: z.string().nullable(),
  /** Local hour (0-23) to nudge at, or null for no reminders. */
  reminderHour: z.number().int().min(0).max(23).nullable().default(null),
  /** IANA zone, so a UTC cron can work out when it is 8pm for this person. */
  timeZone: z.string().nullable().default(null),
  createdAt: z.string(),
});
export type Profile = z.infer<typeof Profile>;

export const PushSubscriptionInput = z.object({
  endpoint: z.string().url().max(600),
  p256dh: z.string().min(8).max(255),
  auth: z.string().min(8).max(255),
});
export type PushSubscriptionInput = z.infer<typeof PushSubscriptionInput>;

export const ReminderSettingsInput = z.object({
  reminderHour: z.number().int().min(0).max(23).nullable(),
  timeZone: z.string().min(1).max(64).optional(),
});
export type ReminderSettingsInput = z.infer<typeof ReminderSettingsInput>;

/** Immutable snapshot written whenever goals change, so history stays honest. */
export const GoalSnapshot = z.object({
  id: z.string(),
  userId: z.string(),
  effectiveFrom: IsoDate,
  age: z.number(),
  gender: Gender,
  heightCm: z.number(),
  weightKg: z.number(),
  targetWeightKg: z.number(),
  weeklyLossKg: z.number(),
  activityLevel: ActivityLevel,
  targets: Targets,
  createdAt: z.string(),
});
export type GoalSnapshot = z.infer<typeof GoalSnapshot>;

/* ------------------------------------------------------------------ */
/* Food                                                                */
/* ------------------------------------------------------------------ */

export const Macros = z.object({
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  fiber: z.number(),
  sugar: z.number(),
});
export type Macros = z.infer<typeof Macros>;

export const FoodEntry = z.object({
  id: z.string(),
  userId: z.string(),
  logDate: IsoDate,
  meal: MealSlot,
  name: z.string(),
  quantity: z.string(),
  emoji: z.string(),
  calories: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  fiber: z.number(),
  sugar: z.number(),
  confidence: Confidence,
  assumptions: z.array(z.string()),
  rawInput: z.string(),
  source: z.enum(["ai", "estimator", "manual"]),
  createdAt: z.string(),
});
export type FoodEntry = z.infer<typeof FoodEntry>;

/**
 * A photo submitted for analysis. The 6MB ceiling is a backstop: the client
 * downscales before sending, so anything near this is a client that skipped it.
 */
export const LogFoodPhotoInput = z.object({
  imageBase64: z.string().min(32).max(6_000_000),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/heic"]),
  date: IsoDate,
  note: z.string().trim().max(240).optional(),
});
export type LogFoodPhotoInput = z.infer<typeof LogFoodPhotoInput>;

export const LogBarcodeInput = z.object({
  code: z.string().trim().regex(/^\d{6,14}$/, "That does not look like a barcode."),
  date: IsoDate,
  meal: MealSlot.optional(),
});
export type LogBarcodeInput = z.infer<typeof LogBarcodeInput>;

export const RepeatFoodInput = z.object({
  sourceId: z.string().min(1),
  date: IsoDate,
  meal: MealSlot.optional(),
});
export type RepeatFoodInput = z.infer<typeof RepeatFoodInput>;

export const LogFoodInput = z.object({
  text: z.string().trim().min(2, "Tell me what you ate.").max(2000),
  date: IsoDate,
});
export type LogFoodInput = z.infer<typeof LogFoodInput>;

export const EditFoodInput = z.object({
  id: z.string(),
  name: z.string().trim().min(1).max(120),
  quantity: z.string().trim().max(80),
  meal: MealSlot,
  calories: z.coerce.number().min(0).max(10000),
  protein: z.coerce.number().min(0).max(1000),
  carbs: z.coerce.number().min(0).max(1000),
  fat: z.coerce.number().min(0).max(1000),
  fiber: z.coerce.number().min(0).max(500),
  sugar: z.coerce.number().min(0).max(500),
});
export type EditFoodInput = z.infer<typeof EditFoodInput>;

/* ------------------------------------------------------------------ */
/* AI: food analysis                                                   */
/* ------------------------------------------------------------------ */

/** Shape the model must return. Kept flat and boring so it is easy to hit. */
export const AiFoodItem = z.object({
  name: z.string().min(1).max(120),
  emoji: z.string().max(8).default("🍽️"),
  meal: MealSlot.catch("snack"),
  estimatedQuantity: z.string().max(120).default("1 serving"),
  calories: z.number().min(0).max(8000),
  protein: z.number().min(0).max(600),
  carbs: z.number().min(0).max(900),
  fat: z.number().min(0).max(500),
  fiber: z.number().min(0).max(200).default(0),
  sugar: z.number().min(0).max(400).default(0),
  confidence: Confidence.catch("medium"),
  /**
   * Assumptions about THIS food.
   *
   * Previously there was only a request-level list, and every item in a
   * multi-food entry was stamped with all of it — so logging a bowl and a
   * yogurt in one sentence left the yogurt claiming the bowl's portion size.
   * Defaulted, because older stored analyses have no such field.
   */
  assumptions: z.array(z.string().max(240)).max(6).default([]),
});
export type AiFoodItem = z.infer<typeof AiFoodItem>;

export const AiFoodAnalysis = z.object({
  foods: z.array(AiFoodItem).min(1).max(30),
  assumptions: z.array(z.string().max(300)).max(12).default([]),
  note: z.string().max(400).default(""),
});
export type AiFoodAnalysis = z.infer<typeof AiFoodAnalysis>;

/* ------------------------------------------------------------------ */
/* AI: coaching                                                        */
/* ------------------------------------------------------------------ */

export const CoachTone = z.enum(["celebrate", "steady", "nudge", "care"]);
export type CoachTone = z.infer<typeof CoachTone>;

export const AiCoachNote = z.object({
  headline: z.string().min(1).max(90),
  message: z.string().min(1).max(900),
  tone: CoachTone.catch("steady"),
  nextMove: z.string().max(220).default(""),
});
export type AiCoachNote = z.infer<typeof AiCoachNote>;

export const AiWeightNote = z.object({
  headline: z.string().min(1).max(90),
  message: z.string().min(1).max(900),
  tone: CoachTone.catch("steady"),
  trendVerdict: z
    .enum(["ahead", "on-track", "slow", "flat", "up", "early"])
    .catch("on-track"),
});
export type AiWeightNote = z.infer<typeof AiWeightNote>;

export const AiPeriodReport = z.object({
  title: z.string().min(1).max(90),
  summary: z.string().min(1).max(1400),
  wins: z.array(z.string().max(200)).max(6).default([]),
  improvements: z.array(z.string().max(200)).max(6).default([]),
  mission: z.string().max(260).default(""),
  grade: z.enum(["A", "B", "C", "D"]).catch("B"),
});
export type AiPeriodReport = z.infer<typeof AiPeriodReport>;

/* ------------------------------------------------------------------ */
/* Daily log + weight                                                  */
/* ------------------------------------------------------------------ */

export const DailyLog = z.object({
  id: z.string(),
  userId: z.string(),
  logDate: IsoDate,
  targets: Targets,
  totals: Macros,
  entryCount: z.number(),
  score: z.number(),
  status: DayStatus,
  coach: AiCoachNote.nullable(),
  coachGeneratedAt: z.string().nullable(),
  coachSignature: z.string().nullable(),
});
export type DailyLog = z.infer<typeof DailyLog>;

export const WeightLog = z.object({
  id: z.string(),
  userId: z.string(),
  loggedOn: IsoDate,
  weightKg: z.number(),
  note: z.string().nullable(),
  coach: AiWeightNote.nullable(),
  createdAt: z.string(),
});
export type WeightLog = z.infer<typeof WeightLog>;

export const LogWeightInput = z.object({
  weightKg: z.coerce.number().min(25).max(400),
  date: IsoDate,
  note: z.string().trim().max(240).optional(),
});
export type LogWeightInput = z.infer<typeof LogWeightInput>;

/* ------------------------------------------------------------------ */
/* Achievements                                                        */
/* ------------------------------------------------------------------ */

export const Achievement = z.object({
  key: z.string(),
  unlockedOn: IsoDate,
});
export type Achievement = z.infer<typeof Achievement>;

/* ------------------------------------------------------------------ */
/* Cached AI reports                                                   */
/* ------------------------------------------------------------------ */

export const REPORT_PERIODS = ["7d", "14d", "30d"] as const;
export const ReportPeriod = z.enum(REPORT_PERIODS);
export type ReportPeriod = z.infer<typeof ReportPeriod>;

export const StoredReport = z.object({
  id: z.string(),
  userId: z.string(),
  period: ReportPeriod,
  periodStart: IsoDate,
  periodEnd: IsoDate,
  signature: z.string(),
  report: AiPeriodReport,
  createdAt: z.string(),
});
export type StoredReport = z.infer<typeof StoredReport>;

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

export const CredentialsInput = z.object({
  email: z.string().trim().email("That email does not look right."),
  password: z.string().min(8, "Use at least 8 characters."),
});
export type CredentialsInput = z.infer<typeof CredentialsInput>;
