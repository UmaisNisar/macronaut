import Link from "next/link";

import { FoodSearch } from "@/components/history/food-search";
import { CalendarGrid } from "@/components/history/calendar-grid";
import { FoodComposer } from "@/components/today/food-composer";
import { CoachPanel } from "@/components/today/coach-panel";
import { MealTimeline } from "@/components/today/meal-timeline";
import { MacroMeters } from "@/components/viz/macro-meters";
import { ScoreDial } from "@/components/viz/score-dial";
import { Magnet, StatusBadge, Sticker, StickerHeading, Squiggle } from "@/components/kit";
import { onboardedProfile, requireUser } from "@/lib/session";
import { userToday } from "@/lib/server-date";
import {
  addDays,
  endOfMonth,
  isValidIso,
  longDayLabel,
  relativeDayLabel,
  startOfMonth,
  startOfWeek,
  type Iso,
} from "@/lib/date";
import { formatWeight } from "@/lib/nutrition";
import { coachSignature, emptyDay, targetsForDate } from "@/server/core";
import { cn } from "@/lib/utils";

export const metadata = { title: "Journal" };
export const dynamic = "force-dynamic";

export default async function HistoryPage(props: PageProps<"/history">) {
  const search = await props.searchParams;
  const { session, store } = await requireUser();
  // Fired together with the page's own queries below rather than before
  // them: the queries only ever needed the id, which the token already has.
  const profilePromise = onboardedProfile();
  const today = await userToday();

  const rawDate = typeof search.d === "string" ? search.d : undefined;
  const selected: Iso =
    rawDate && isValidIso(rawDate) && rawDate <= today ? rawDate : today;

  const rawMonth = typeof search.m === "string" ? search.m : undefined;
  const monthAnchor: Iso = rawMonth && isValidIso(rawMonth) ? rawMonth : selected;

  const gridStart = addDays(startOfMonth(monthAnchor), -7);
  const gridEnd = addDays(endOfMonth(monthAnchor), 7);

  // The day itself joins the batch too. It used to be fetched afterwards, on
  // its own, which is a second border crossing for one row.
  const [profile, goals, monthDays, entries, weights, existingDay] =
    await Promise.all([
      profilePromise,
      store.listGoalSnapshots(session.userId),
      store.listDailyLogs(session.userId, gridStart, gridEnd),
      store.listFoodEntries(session.userId, selected, selected),
      store.listWeightLogs(session.userId),
      store.getDailyLog(session.userId, selected),
    ]);

  const targets = targetsForDate(goals, profile, selected);
  const day = existingDay ?? emptyDay(session.userId, selected, targets);

  const weightOnDay = weights.find((w) => w.loggedOn === selected) ?? null;
  const isToday = selected === today;
  const overUnder = Math.round(day.totals.calories - targets.calories);

  const coachIsStale =
    day.entryCount > 0 &&
    day.coachSignature !== coachSignature(day.totals, day.entryCount);

  const jumps = [
    { label: "Today", emoji: "🍓", iso: today },
    { label: "Yesterday", emoji: "🌙", iso: addDays(today, -1) },
    { label: "Last week", emoji: "📅", iso: addDays(startOfWeek(today), -7) },
    { label: "2 weeks ago", emoji: "🕰️", iso: addDays(today, -14) },
    { label: "A month ago", emoji: "🗓️", iso: addDays(today, -30) },
  ];

  return (
    <div className="space-y-4 sm:space-y-5">
      <header>
        <p className="label-cute">Everything you&rsquo;ve logged</p>
        <h1 className="mt-0.5 text-2xl font-bold sm:text-3xl">
          Your food journal <span aria-hidden>📖</span>
        </h1>
      </header>

      {/*
        grid-cols-[minmax(0,1fr)] on the phone layout: a grid track sizes to
        its item's min-content unless told it may shrink, and one stubborn
        child then drags the whole column past the edge of the screen.
      */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:gap-5 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0 space-y-4 lg:sticky lg:top-6">
          <Sticker>
            <FoodSearch today={today} />

            <CalendarGrid
              monthIso={monthAnchor}
              selectedIso={selected}
              todayIso={today}
              days={monthDays}
            />
          </Sticker>

          <Sticker tint="violet" tilt={-0.6}>
            <p className="label-cute mb-2.5">Jump to</p>
            <div className="flex flex-wrap gap-1.5">
              {jumps.map((jump) => (
                <Link
                  key={jump.label}
                  href={`/history?d=${jump.iso}&m=${jump.iso}`}
                  className={cn(
                    "rounded-full px-3 py-2 text-xs font-bold transition-transform hover:-translate-y-0.5 active:scale-95",
                    jump.iso === selected
                      ? "bg-[var(--violet-solid)] text-white shadow-[0_3px_0_0_var(--primary-lip)]"
                      : "bg-[var(--inset)] text-[var(--ink-soft)] shadow-[0_3px_0_0_var(--violet-soft)]",
                  )}
                >
                  <span aria-hidden className="mr-1">
                    {jump.emoji}
                  </span>
                  {jump.label}
                </Link>
              ))}
            </div>
          </Sticker>
        </div>

        <div className="min-w-0 space-y-4 sm:space-y-5">
          {/* The journal page */}
          <Sticker tint={day.entryCount === 0 ? "plain" : "peach"}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="label-cute">{relativeDayLabel(selected, today)}</p>
                <h2 className="mt-0.5 text-xl font-bold sm:text-2xl">
                  {longDayLabel(selected)}
                </h2>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <StatusBadge status={day.status} />
                  {weightOnDay ? (
                    <span className="rounded-full bg-[var(--inset)] px-3 py-1.5 text-xs font-bold text-[var(--ink-soft)]">
                      ⚖️ {formatWeight(weightOnDay.weightKg, profile.units)}
                    </span>
                  ) : null}
                </div>
              </div>
              <ScoreDial score={day.score} status={day.status} size={92} />
            </div>

            <Squiggle />

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Magnet
                label="Energy"
                emoji="🔥"
                value={Math.round(day.totals.calories).toLocaleString()}
                hint={`of ${targets.calories.toLocaleString()}`}
                color="var(--peach)"
              />
              <Magnet
                label={overUnder >= 0 ? "Over" : "Under"}
                emoji={overUnder >= 0 ? "⬆️" : "⬇️"}
                value={`${Math.abs(overUnder).toLocaleString()}`}
                hint="kcal"
                color={
                  day.entryCount === 0
                    ? undefined
                    : overUnder > 0
                      ? "var(--peach)"
                      : "var(--mint)"
                }
              />
              <Magnet
                label="Protein"
                emoji="💪"
                value={`${Math.round(day.totals.protein)}g`}
                hint={`of ${targets.protein}g`}
                color="var(--mint)"
              />
              <Magnet
                label="Items"
                emoji="🍽️"
                value={day.entryCount}
                hint={day.entryCount === 0 ? "nothing yet" : undefined}
              />
            </div>

            {day.entryCount > 0 ? (
              <>
                <Squiggle />
                <MacroMeters
                  compact
                  rows={[
                    {
                      kind: "protein",
                      value: day.totals.protein,
                      target: targets.protein,
                    },
                    {
                      kind: "carbs",
                      value: day.totals.carbs,
                      target: targets.carbs,
                    },
                    { kind: "fat", value: day.totals.fat, target: targets.fat },
                    {
                      kind: "fiber",
                      value: day.totals.fiber,
                      target: targets.fiber,
                    },
                    {
                      kind: "sugar",
                      value: day.totals.sugar,
                      target: targets.sugar,
                    },
                  ]}
                />
              </>
            ) : null}
          </Sticker>

          <CoachPanel
            date={selected}
            initialCoach={day.coach}
            stale={coachIsStale}
            hasEntries={day.entryCount > 0}
            autoGenerate={isToday}
          />

          <Sticker>
            <StickerHeading
              emoji="🍱"
              title={
                day.entryCount === 0
                  ? "Nothing on this page"
                  : `${day.entryCount} thing${day.entryCount > 1 ? "s" : ""}`
              }
              action={
                <span className="numeral rounded-full bg-[var(--peach-soft)] px-3 py-1.5 text-sm text-[var(--peach)]">
                  {Math.round(day.totals.calories).toLocaleString()} kcal
                </span>
              }
            />
            <MealTimeline entries={entries} date={selected} today={today} />
          </Sticker>

          {/* Today already has this composer; here it would only be a repeat.
              On an older day it is the one way to backfill a missed meal. */}
          {isToday ? null : (
            <FoodComposer date={selected} isToday={false} />
          )}

        </div>
      </div>
    </div>
  );
}
