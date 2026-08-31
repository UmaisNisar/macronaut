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
import { ScoreDial } from "@/components/viz/score-dial";
import { MomoGreeter } from "@/components/mascot/momo-greeter";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import {
  Squiggle,
  StatusBadge,
  Sticker,
  StickerHeading,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { onboardedProfile, requireUser } from "@/lib/session";
import { userToday } from "@/lib/server-date";
import { addDays, longDayLabel } from "@/lib/date";
import {
  achievableWeeklyLoss,
  computeJourney,
  formatWeight,
} from "@/lib/nutrition";
import { computeStreaks, weekBudget, weightStats } from "@/lib/insights";
import { coachSignature, emptyDay, targetsForDate } from "@/server/core";
import { WeekBudgetCard } from "@/components/today/week-budget";

export const metadata = { title: "Today" };
export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const { session, store } = await requireUser();
  const today = await userToday();

  // The profile goes in the same batch as everything else. It used to be
  // awaited first, which put a whole Montreal round trip in front of the
  // queries that were only ever waiting on the user id.
  const [profile, goals, entries, recent, weights, frequent] = await Promise.all([
    onboardedProfile(),
    store.listGoalSnapshots(session.userId),
    store.listFoodEntries(session.userId, today, today),
    store.listDailyLogs(session.userId, addDays(today, -60), today),
    store.listWeightLogs(session.userId),
    /*
     * Twelve, and the number matters in both directions.
     *
     * It was eight, sized for how many fit on screen, which stopped making
     * sense once the row scrolled. Twenty was the overcorrection: a strip
     * that long is a scrolling chore rather than a shortcut, and the tail
     * of it is food you ate once a fortnight ago.
     *
     * The ranking is by how often you eat something, so the useful ones are
     * at the front and the cut only ever removes the rarest.
     */
    store.listFrequentFoods(session.userId, 12),
  ]);

  const targets = targetsForDate(goals, profile, today);
  // Free: the page already has every log and snapshot it needs.
  const week = weekBudget(recent, today, targets.calories);
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

      {/*
        One progress card, not four.
        
        This was a two-week bar strip, a journey card, a three-stat footer and
        the week budget, stacked -- two of them bar charts of recent days
        sitting a few hundred pixels apart. On the screen whose job is logging
        a meal, that is four dashboards below the meal.

        What stays is the week, because it is the only one that changes what
        you eat today, plus a single line of journey with a way through to the
        rest. Streaks live on Insights, weight history on Journey, and past
        days are a tap on the bars above or the Journal calendar.
      */}
      <Sticker tint="berry">
        <WeekBudgetCard week={week} />

        <Squiggle />

        {/* No Momo here. She is already the greeter at the top of this page
            and again beside the coach note; a third copy was decoration
            squeezing the line it sat next to into two wrapped fragments. */}
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="label-cute">Journey</p>
            <p className="mt-0.5 text-sm font-semibold">
              <span className="numeral text-[var(--mint)]">
                {Math.round(journey.percent * 100)}%
              </span>{" "}
              <span className="text-[var(--ink-soft)]">
                there · {formatWeight(journey.remainingKg, profile.units)} to go
              </span>
            </p>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[var(--inset)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--sky)] to-[var(--mint)]"
                style={{ width: `${Math.max(4, journey.percent * 100)}%` }}
              />
            </div>
          </div>
          <Button
            variant="ghost"
            nativeButton={false}
            className="shrink-0"
            render={<Link href="/progress" />}
          >
            Map →
          </Button>
        </div>
      </Sticker>
    </div>
  );
}
