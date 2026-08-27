import type { DailyLog } from "@/lib/schemas";
import type { Journey } from "@/lib/nutrition";
import type { Streaks } from "@/lib/insights";

export type AchievementTier = "bronze" | "silver" | "gold";

export type AchievementDef = {
  key: string;
  name: string;
  emoji: string;
  description: string;
  tier: AchievementTier;
};

export type AchievementContext = {
  streaks: Streaks;
  journey: Journey;
  days: DailyLog[];
  weightCount: number;
  bestScore: number;
  proteinHitsLast7: number;
  fiberHitsLast7: number;
  consistency14: number;
};

type Rule = AchievementDef & { earned: (c: AchievementContext) => boolean };

/**
 * Deliberately reachable. The point is to mark real milestones on a long
 * journey, not to gate anything behind grinding.
 */
const RULES: Rule[] = [
  {
    key: "ignition",
    name: "Ignition",
    emoji: "🚀",
    description: "Log your first meal",
    tier: "bronze",
    earned: (c) => c.streaks.totalDaysLogged >= 1,
  },
  {
    key: "baseline",
    name: "Baseline Set",
    emoji: "⚖️",
    description: "Log your first weight reading",
    tier: "bronze",
    earned: (c) => c.weightCount >= 1,
  },
  {
    key: "streak-3",
    name: "Three in a Row",
    emoji: "🔗",
    description: "Log food three days running",
    tier: "bronze",
    earned: (c) => c.streaks.longestLogging >= 3,
  },
  {
    key: "first-week",
    name: "First Week Complete",
    emoji: "🏆",
    description: "Log seven days in total",
    tier: "silver",
    earned: (c) => c.streaks.totalDaysLogged >= 7,
  },
  {
    key: "streak-7",
    name: "Seven-Day Streak",
    emoji: "🔥",
    description: "Log food seven days running",
    tier: "silver",
    earned: (c) => c.streaks.longestLogging >= 7,
  },
  {
    key: "streak-30",
    name: "Thirty-Day Streak",
    emoji: "🛰️",
    description: "Log food thirty days running",
    tier: "gold",
    earned: (c) => c.streaks.longestLogging >= 30,
  },
  {
    key: "bullseye",
    name: "Bullseye",
    emoji: "🎯",
    description: "Score 95 or higher on a single day",
    tier: "silver",
    earned: (c) => c.bestScore >= 95,
  },
  {
    key: "protein-champion",
    name: "Protein Champion",
    emoji: "💪",
    description: "Hit your protein target five days in a week",
    tier: "silver",
    earned: (c) => c.proteinHitsLast7 >= 5,
  },
  {
    key: "green-machine",
    name: "Green Machine",
    emoji: "🥬",
    description: "Hit your fiber target four days in a week",
    tier: "silver",
    earned: (c) => c.fiberHitsLast7 >= 4,
  },
  {
    key: "locked-in",
    name: "Locked In",
    emoji: "🧲",
    description: "80% calorie consistency across a fortnight",
    tier: "gold",
    earned: (c) => c.consistency14 >= 0.8,
  },
  {
    key: "first-kilo",
    name: "First Kilogram",
    emoji: "🪶",
    description: "Lose your first kilogram",
    tier: "bronze",
    earned: (c) => c.journey.lostKg >= 1,
  },
  {
    key: "five-down",
    name: "Five Down",
    emoji: "📉",
    description: "Lose five kilograms",
    tier: "silver",
    earned: (c) => c.journey.lostKg >= 5,
  },
  {
    key: "ten-down",
    name: "Ten Down",
    emoji: "🏔️",
    description: "Lose ten kilograms",
    tier: "gold",
    earned: (c) => c.journey.lostKg >= 10,
  },
  {
    key: "halfway",
    name: "Halfway There",
    emoji: "🌗",
    description: "Reach 50% of your goal",
    tier: "silver",
    earned: (c) => c.journey.totalKg > 0 && c.journey.percent >= 0.5,
  },
  {
    key: "mission-complete",
    name: "Mission Complete",
    emoji: "🥇",
    description: "Reach your target weight",
    tier: "gold",
    earned: (c) => c.journey.reachedGoal && c.weightCount >= 2,
  },
];

export const ACHIEVEMENTS: AchievementDef[] = RULES.map(
  ({ key, name, emoji, description, tier }) => ({
    key,
    name,
    emoji,
    description,
    tier,
  }),
);

export const ACHIEVEMENT_BY_KEY = new Map(ACHIEVEMENTS.map((a) => [a.key, a]));

export function earnedKeys(context: AchievementContext): string[] {
  return RULES.filter((r) => r.earned(context)).map((r) => r.key);
}
