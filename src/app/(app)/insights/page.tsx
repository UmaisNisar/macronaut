import Link from "next/link";

import { AchievementGrid } from "@/components/insights/achievement-grid";
import { WeeklyRecap, type RecapStats } from "@/components/insights/weekly-recap";
import { WeekStrip } from "@/components/viz/week-strip";
import { Magnet, Sticker, StickerHeading } from "@/components/kit";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { requireProfile } from "@/lib/session";
import { userToday } from "@/lib/server-date";
import { addDays, type Iso } from "@/lib/date";
import { formatWeight, round } from "@/lib/nutrition";
import {
  buildDaySeries,
  computeStreaks,
  periodPair,
  weightStats,
} from "@/lib/insights";
import { isGeminiConfigured } from "@/lib/env";
import { targetsForDate } from "@/server/core";
import { REPORT_PERIODS, type ReportPeriod } from "@/lib/schemas";
import { cn } from "@/lib/utils";

export const metadata = { title: "Insights" };
export const dynamic = "force-dynamic";

const PERIOD_META: Record<ReportPeriod, { days: number; label: string }> = {
  "7d": { days: 7, label: "This week" },
  "14d": { days: 14, label: "2 weeks" },
  "30d": { days: 30, label: "This month" },
};

export default async function InsightsPage(props: PageProps<"/insights">) {
  const search = await props.searchParams;
  const { store, profile } = await requireProfile();
  const today = await userToday();

  const period: ReportPeriod = REPORT_PERIODS.includes(search.p as ReportPeriod)
    ? (search.p as ReportPeriod)
    : "7d";
  const { days: length } = PERIOD_META[period];

  const [goals, days, weights, achievements] = await Promise.all([
    store.listGoalSnapshots(profile.id),
    store.listDailyLogs(profile.id, addDays(today, -90), today),
    store.listWeightLogs(profile.id),
    store.listAchievements(profile.id),
  ]);

  const targets = targetsForDate(goals, profile, today);
  const { current, previous } = periodPair(days, today, length);
  const streaks = computeStreaks(days, today);
  const wStats = weightStats(weights, today);
  const series = buildDaySeries(days, today, length, targets.calories);

  const windowStart = addDays(today, -(length - 1));
  const inWindow = weights.filter(
    (w) => w.loggedOn >= windowStart && w.loggedOn <= today,
  );
  const weightDelta =
    inWindow.length >= 2
      ? round(inWindow[inWindow.length - 1].weightKg - inWindow[0].weightKg, 1)
      : null;

  const unlocked = new Map<string, Iso>(
    achievements.map((a) => [a.key, a.unlockedOn]),
  );

  const recapStats: RecapStats = {
    daysLogged: current.daysLogged,
    totalDays: current.totalDays,
    avgCalories: current.avgCalories,
    avgTarget: current.avgTarget || targets.calories,
    avgProtein: current.avgProtein,
    proteinDelta: round(current.avgProtein - previous.avgProtein),
    calorieDelta: round(current.avgCalories - previous.avgCalories),
    onTargetDays: current.onTargetDays,
    weightDelta,
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <header>
        <p className="label-cute">The bigger picture</p>
        <h1 className="mt-0.5 text-2xl font-bold sm:text-3xl">
          Your recap <span aria-hidden>✨</span>
        </h1>
      </header>

      <div className="flex flex-wrap gap-2">
        {REPORT_PERIODS.map((p) => (
          <Link
            key={p}
            href={`/insights?p=${p}`}
            className={cn(
              "rounded-full px-4 py-2.5 text-sm font-bold transition-transform hover:-translate-y-0.5 active:scale-95",
              p === period
                ? "bg-[var(--violet)] text-white shadow-[0_4px_0_0_var(--primary-lip)]"
                : "bg-[var(--inset)] text-[var(--ink-soft)] shadow-[0_4px_0_0_var(--violet-soft)]",
            )}
          >
            {PERIOD_META[p].label}
          </Link>
        ))}
      </div>

      {/* key={period} so switching periods replays the reveal from the top */}
      <WeeklyRecap key={period} period={period} stats={recapStats} />

      <Sticker tint="peach">
        <StickerHeading emoji="🔢" title="The numbers behind it" />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          <Magnet
            label="Avg energy"
            emoji="🔥"
            value={current.avgCalories.toLocaleString()}
            hint={`goal ${(current.avgTarget || targets.calories).toLocaleString()}`}
            color="var(--peach)"
          />
          <Magnet
            label="Avg protein"
            emoji="💪"
            value={`${current.avgProtein}g`}
            hint={
              previous.daysLogged
                ? `${recapStats.proteinDelta >= 0 ? "▲" : "▼"} ${Math.abs(recapStats.proteinDelta)}g`
                : "no prior period"
            }
            color="var(--mint)"
          />
          <Magnet
            label="Logged"
            emoji="📖"
            value={`${current.daysLogged}/${current.totalDays}`}
            hint={`${Math.round((current.daysLogged / current.totalDays) * 100)}% covered`}
            color="var(--sky)"
          />
          <Magnet
            label="In the band"
            emoji="🎯"
            value={`${Math.round(current.consistency * 100)}%`}
            hint={`${current.onTargetDays} days`}
            color="var(--violet)"
          />
          <Magnet
            label="Weight"
            emoji="⚖️"
            value={
              weightDelta === null
                ? "—"
                : `${weightDelta > 0 ? "+" : "−"}${Math.abs(weightDelta)} kg`
            }
            hint={
              wStats.latest
                ? `now ${formatWeight(wStats.latest.weightKg, profile.units)}`
                : "no readings"
            }
            color={
              weightDelta === null
                ? undefined
                : weightDelta < 0
                  ? "var(--mint)"
                  : "var(--peach)"
            }
          />
        </div>

        <div className="mt-5">
          <p className="label-cute mb-3">Every day in this window</p>
          <WeekStrip series={series} />
        </div>
      </Sticker>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] lg:items-start">
        <Sticker tint="sun" tilt={-0.6}>
          <StickerHeading emoji="🔥" title="Streaks" />
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { emoji: "🔥", value: streaks.logging, label: "day streak" },
              { emoji: "🎯", value: streaks.consistency, label: "days in band" },
              { emoji: "🏆", value: streaks.longestLogging, label: "best ever" },
              { emoji: "📖", value: streaks.totalDaysLogged, label: "days total" },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-3xl bg-[var(--inset)] px-3.5 py-3 text-center"
              >
                <span className="text-xl" aria-hidden>
                  {s.emoji}
                </span>
                <p className="numeral mt-1 text-2xl leading-none">{s.value}</p>
                <p className="label-cute mt-1 text-[0.5rem]">{s.label}</p>
              </div>
            ))}
          </div>

          {!isGeminiConfigured ? (
            <p className="mt-4 rounded-2xl bg-[var(--inset)] px-3.5 py-3 text-xs leading-relaxed font-medium text-[var(--ink-soft)]">
              No Gemini key set, so Momo writes recaps from built-in templates.
              They use your real numbers, but the model version reads much
              better — add{" "}
              <code className="rounded bg-[var(--muted)] px-1 py-0.5">
                GEMINI_API_KEY
              </code>{" "}
              to switch it on.
            </p>
          ) : null}
        </Sticker>

        <Sticker tilt={0.4}>
          <StickerHeading
            emoji="🏅"
            title="Sticker book"
            hint={`${unlocked.size} of ${ACHIEVEMENTS.length} collected`}
          />
          <AchievementGrid unlocked={unlocked} />
        </Sticker>
      </div>
    </div>
  );
}
