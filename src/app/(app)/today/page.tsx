import Link from "next/link";

import { CoachPanel } from "@/components/today/coach-panel";
import { FoodComposer } from "@/components/today/food-composer";
import { MealTimeline } from "@/components/today/meal-timeline";
import { EstimateNotice } from "@/components/today/estimate-notice";
import { OfflineBanner } from "@/components/shell/offline-banner";
import { OfflineOutbox } from "@/components/today/offline-outbox";
import { QuickRepeat } from "@/components/today/quick-repeat";
import { TargetReached } from "@/components/today/target-reached";
import { WeighInBar } from "@/components/weight/weigh-in-bar";
import { EnergyBubble } from "@/components/viz/energy-bubble";
import { MacroMeters } from "@/components/viz/macro-meters";
import { WeekStrip } from "@/components/viz/week-strip";
import { ScoreDial } from "@/components/viz/score-dial";
import { Momo } from "@/components/mascot/momo";
import { MomoGreeter } from "@/components/mascot/momo-greeter";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Magnet, StatusBadge, Sticker, StickerHeading } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/session";
import { userToday } from "@/lib/server-date";
import { addDays, longDayLabel } from "@/lib/date";
import {
  achievableWeeklyLoss,
  computeJourney,
  formatWeight,
  round,
} from "@/lib/nutrition";
import { buildDaySeries, computeStreaks, weightStats } from "@/lib/insights";
import { coachSignature, emptyDay, targetsForDate } from "@/server/core";

export const metadata = { title: "Today" };
export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const { store, profile } = await requireProfile();
  const today = await userToday();

  const [goals, entries, recent, weights, frequent] = await Promise.all([
    store.listGoalSnapshots(profile.id),
    store.listFoodEntries(profile.id, today, today),
    store.listDailyLogs(profile.id, addDays(today, -60), today),
    store.listWeightLogs(profile.id),
    store.listFrequentFoods(profile.id, 8),
  ]);

  const targets = targetsForDate(goals, profile, today);
  const day =
    recent.find((d) => d.logDate === today) ??
    emptyDay(profile.id, today, targets);

  const streaks = computeStreaks(recent, today);
  const wStats = weightStats(weights, today);
  const currentKg = wStats.latest?.weightKg ?? profile.currentWeightKg;

  const journey = computeJourney({
    startKg: profile.startingWeightKg,
    currentKg,
    targetKg: profile.targetWeightKg,
    weeklyLossKg: achievableWeeklyLoss(targets) || profile.weeklyLossKg,
    fromIsoDate: today,
  });

  const series = buildDaySeries(recent, today, 14, targets.calories);
  const yesterday = recent.find((d) => d.logDate === addDays(today, -1));
  const deltaVsYesterday =
    yesterday && yesterday.entryCount > 0 && day.entryCount > 0
      ? Math.round(day.totals.calories - yesterday.totals.calories)
      : null;

  const coachIsStale =
    day.entryCount > 0 &&
    day.coachSignature !== coachSignature(day.totals, day.entryCount);

  const firstName = profile.displayName?.split(" ")[0];
  const greetMood =
    day.entryCount === 0
      ? "curious"
      : day.status === "great"
        ? "celebrating"
        : day.status === "over"
          ? "caring"
          : "proud";

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Greeting */}
      <header className="flex items-center gap-3">
        <MomoGreeter mood={greetMood} size={62} className="lg:hidden" />
        <div className="min-w-0 flex-1">
          <p className="label-cute">{longDayLabel(today)}</p>
          <h1 className="mt-0.5 text-2xl leading-tight font-bold text-balance sm:text-3xl">
            Hey{firstName ? ` ${firstName}` : ""}! Let&rsquo;s see how
            today&rsquo;s going <span aria-hidden>👀</span>
          </h1>
        </div>
        <ThemeToggle className="shrink-0 lg:hidden" />
        {streaks.logging > 0 ? (
          <div
            className="hidden shrink-0 flex-col items-center rounded-3xl bg-[var(--sun-soft)] px-3.5 py-2 sm:flex"
            title={`${streaks.logging} day logging streak`}
          >
            <span className="text-xl leading-none" aria-hidden>
              🔥
            </span>
            <span className="numeral text-base leading-none text-[#D98A00]">
              {streaks.logging}
            </span>
            <span className="label-cute text-[0.5rem]">days</span>
          </div>
        ) : null}
      </header>

      <WeighInBar
        today={today}
        units={profile.units}
        currentKg={currentKg}
        latest={wStats.latest}
        previous={wStats.previous}
      />

      {/* Hero: the jar */}
      <TargetReached
        date={today}
        calories={day.totals.calories}
        target={targets.calories}
        protein={day.totals.protein}
        proteinTarget={targets.protein}
      />

      <Sticker tint="violet" className="overflow-hidden">
        <div className="grid gap-5 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)] md:items-center md:gap-7">
          <div>
            <EnergyBubble
              calories={day.totals.calories}
              target={targets.calories}
            />
            <div className="mt-3 flex justify-center">
              <StatusBadge status={day.status} />
            </div>
          </div>

          <div>
            <div className="mb-4 flex items-center gap-3">
              <ScoreDial score={day.score} status={day.status} size={92} />
              <p className="text-sm leading-relaxed font-medium text-pretty text-[var(--ink-soft)]">
                {day.entryCount === 0
                  ? "The jar fills up as you log. Nothing in it yet!"
                  : deltaVsYesterday === null
                    ? `${day.entryCount} thing${day.entryCount > 1 ? "s" : ""} logged so far today.`
                    : deltaVsYesterday === 0
                      ? "Exactly level with yesterday. Spooky."
                      : `${Math.abs(deltaVsYesterday).toLocaleString()} kcal ${
                          deltaVsYesterday < 0 ? "under" : "over"
                        } where you were yesterday.`}
              </p>
            </div>

            <MacroMeters
              rows={[
                {
                  kind: "protein",
                  value: day.totals.protein,
                  target: targets.protein,
                },
                { kind: "carbs", value: day.totals.carbs, target: targets.carbs },
                { kind: "fat", value: day.totals.fat, target: targets.fat },
                { kind: "fiber", value: day.totals.fiber, target: targets.fiber },
                { kind: "sugar", value: day.totals.sugar, target: targets.sugar },
              ]}
            />
          </div>
        </div>
      </Sticker>

      <div>
        <OfflineBanner />
        <EstimateNotice entries={entries} />
        <OfflineOutbox />
        <QuickRepeat foods={frequent} date={today} />
        <FoodComposer
          date={today}
          isToday
          isFirstEver={streaks.totalDaysLogged === 0}
        />
      </div>

      <CoachPanel
        date={today}
        initialCoach={day.coach}
        stale={coachIsStale}
        hasEntries={day.entryCount > 0}
      />

      {/* Journal */}
      <Sticker>
        <StickerHeading
          emoji="🍱"
          title={
            day.entryCount === 0
              ? "Today's plate"
              : `${day.entryCount} thing${day.entryCount > 1 ? "s" : ""} today`
          }
          action={
            <span className="numeral rounded-full bg-[var(--peach-soft)] px-3 py-1.5 text-sm text-[var(--peach)]">
              {Math.round(day.totals.calories).toLocaleString()} kcal
            </span>
          }
        />
        <MealTimeline entries={entries} date={today} today={today} />
      </Sticker>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
        <Sticker tint="sky" tilt={-0.5}>
          <StickerHeading
            emoji="📊"
            title="Your last 2 weeks"
            hint="Tap a day to open it"
          />
          <WeekStrip series={series} />
        </Sticker>

        <Sticker tint="mint" tilt={0.5}>
          <StickerHeading emoji="🚀" title="Journey so far" />
          <div className="flex items-center gap-4">
            <Momo mood="proud" size={72} bare />
            <div className="min-w-0 flex-1">
              <p className="numeral text-3xl leading-none text-[var(--mint)]">
                {Math.round(journey.percent * 100)}%
              </p>
              <p className="mt-1 text-sm font-semibold text-[var(--ink-soft)]">
                {formatWeight(journey.remainingKg, profile.units)} to go
              </p>
              <div className="mt-2.5 h-3 overflow-hidden rounded-full bg-[var(--inset)]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--sky)] to-[var(--mint)]"
                  style={{ width: `${Math.max(4, journey.percent * 100)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <Magnet
              label="Start"
              value={formatWeight(journey.startKg, profile.units)}
              className="bg-[var(--inset)]"
            />
            <Magnet
              label="Now"
              value={formatWeight(journey.currentKg, profile.units)}
              color="var(--mint)"
            />
            <Magnet
              label="Goal"
              value={formatWeight(journey.targetKg, profile.units)}
              className="bg-[var(--inset)]"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="ghost"
              nativeButton={false}
              render={<Link href="/progress" />}
            >
              See the map →
            </Button>
          </div>
        </Sticker>
      </div>

      <Sticker tint="sun" inset={false} className="px-5 py-4">
        <div className="flex items-center gap-4">
          <span className="text-2xl" aria-hidden>
            🏅
          </span>
          <div className="grid flex-1 grid-cols-3 gap-3 text-center">
            <div>
              <p className="numeral text-xl leading-none">
                {streaks.totalDaysLogged}
              </p>
              <p className="label-cute mt-1 text-[0.5rem]">days logged</p>
            </div>
            <div>
              <p className="numeral text-xl leading-none">
                {streaks.longestLogging}
              </p>
              <p className="label-cute mt-1 text-[0.5rem]">best streak</p>
            </div>
            <div>
              <p className="numeral text-xl leading-none">
                {round(Math.max(0, journey.lostKg), 1)}
              </p>
              <p className="label-cute mt-1 text-[0.5rem]">kg lost</p>
            </div>
          </div>
        </div>
      </Sticker>
    </div>
  );
}
