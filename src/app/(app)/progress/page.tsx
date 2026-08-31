import Link from "next/link";

import { LogWeightDialog } from "@/components/weight/log-weight-dialog";
import { WeightLogList } from "@/components/weight/weight-log-list";
import { WeightChart } from "@/components/viz/weight-chart";
import { JourneyPath } from "@/components/viz/journey-path";
import { WeekStrip } from "@/components/viz/week-strip";
import { Magnet, Sticker, StickerHeading, Squiggle } from "@/components/kit";
import { onboardedProfile, requireUser } from "@/lib/session";
import { userToday } from "@/lib/server-date";
import { addDays, type Iso } from "@/lib/date";
import {
  achievableWeeklyLoss,
  computeJourney,
  formatWeight,
  formatWeightDelta,
  round,
} from "@/lib/nutrition";
import {
  buildDaySeries,
  buildInsights,
  periodPair,
  weightStats,
} from "@/lib/insights";
import { targetsForDate } from "@/server/core";
import { cn } from "@/lib/utils";

export const metadata = { title: "Journey" };
export const dynamic = "force-dynamic";

const PERIODS = [
  { key: "7", days: 7, label: "7 days" },
  { key: "14", days: 14, label: "14 days" },
  { key: "30", days: 30, label: "30 days" },
] as const;

const RANGES = [
  { key: "30", days: 30, label: "30d" },
  { key: "90", days: 90, label: "90d" },
  { key: "all", days: 3650, label: "All" },
] as const;

export default async function ProgressPage(props: PageProps<"/progress">) {
  const search = await props.searchParams;
  const { session, store } = await requireUser();
  // Fired together with the page's own queries below rather than before
  // them: the queries only ever needed the id, which the token already has.
  const profilePromise = onboardedProfile();
  const today = await userToday();

  const period = PERIODS.find((p) => p.key === search.p) ?? PERIODS[1];
  const range = RANGES.find((r) => r.key === search.r) ?? RANGES[0];

  const [profile, goals, days, weights] = await Promise.all([
    profilePromise,
    store.listGoalSnapshots(session.userId),
    store.listDailyLogs(session.userId, addDays(today, -120), today),
    store.listWeightLogs(session.userId),
  ]);

  const targets = targetsForDate(goals, profile, today);
  const wStats = weightStats(weights, today);
  const currentKg = wStats.latest?.weightKg ?? profile.currentWeightKg;

  const journey = computeJourney({
    startKg: profile.startingWeightKg,
    currentKg,
    targetKg: profile.targetWeightKg,
    weeklyLossKg:
      wStats.ratePerWeek && wStats.ratePerWeek < -0.05
        ? Math.abs(wStats.ratePerWeek)
        : achievableWeeklyLoss(targets) || profile.weeklyLossKg,
    fromIsoDate: today,
  });

  const { current, previous } = periodPair(days, today, period.days);
  const insights = buildInsights(current, previous, weights);
  const series = buildDaySeries(days, today, period.days, targets.calories);

  const chartFrom: Iso = addDays(today, -range.days);
  const chartPoints = weights
    .filter((w) => w.loggedOn >= chartFrom)
    .map((w) => ({ iso: w.loggedOn, kg: w.weightKg }));



  const comparisons = [
    {
      label: "🔥 Avg calories",
      now: current.avgCalories.toLocaleString(),
      before: previous.avgCalories.toLocaleString(),
      delta: current.avgCalories - previous.avgCalories,
      invert: true,
    },
    {
      label: "💪 Avg protein",
      now: `${current.avgProtein}g`,
      before: `${previous.avgProtein}g`,
      delta: current.avgProtein - previous.avgProtein,
    },
    {
      label: "🌱 Avg fiber",
      now: `${current.avgFiber}g`,
      before: `${previous.avgFiber}g`,
      delta: current.avgFiber - previous.avgFiber,
    },
    {
      label: "⭐ Avg score",
      now: `${current.avgScore}`,
      before: `${previous.avgScore}`,
      delta: current.avgScore - previous.avgScore,
    },
    {
      label: "📖 Days logged",
      now: `${current.daysLogged}/${current.totalDays}`,
      before: `${previous.daysLogged}/${previous.totalDays}`,
      delta: current.daysLogged - previous.daysLogged,
    },
    {
      label: "🎯 Consistency",
      now: `${Math.round(current.consistency * 100)}%`,
      before: `${Math.round(previous.consistency * 100)}%`,
      delta: Math.round((current.consistency - previous.consistency) * 100),
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-cute">Where you&rsquo;re headed</p>
          <h1 className="mt-0.5 text-2xl font-bold sm:text-3xl">
            Your journey <span aria-hidden>🚀</span>
          </h1>
        </div>
        <LogWeightDialog
          today={today}
          units={profile.units}
          currentKg={currentKg}
        />
      </header>

      {/* The map */}
      <Sticker tint="mint" className="overflow-hidden">
        <JourneyPath journey={journey} units={profile.units} />

        <Squiggle />

        {/*
          Three, not six.

          Start, Goal and Lost were all restatements: the path graphic above
          already draws start to goal with the percentage on it, and Lost is
          just Start minus Now. Six tiles put the same weight on screen eight
          times before you scrolled. What is left is the three things you
          cannot read off the picture.
        */}
        <div className="grid grid-cols-3 gap-2.5">
          <Magnet
            label="Now"
            emoji="🧍"
            value={formatWeight(journey.currentKg, profile.units)}
            color="var(--violet)"
          />
          <Magnet
            label="To go"
            emoji="🛣️"
            value={formatWeight(journey.remainingKg, profile.units)}
            className="bg-[var(--inset)]"
          />
          <Magnet
            label="Pace"
            emoji="⏱️"
            value={
              wStats.ratePerWeek === null
                ? "—"
                : formatWeightDelta(wStats.ratePerWeek, profile.units)
            }
            hint="per week"
            className="bg-[var(--inset)]"
          />
        </div>

        {journey.weeksLeft && !journey.reachedGoal ? (
          <p className="mt-4 text-sm font-medium text-pretty text-[var(--ink-soft)]">
            At the pace your readings actually show, you&rsquo;d get there in about{" "}
            <span className="font-bold text-[var(--ink)]">
              {Math.ceil(journey.weeksLeft)} weeks
            </span>
            . That number moves every time you log, which is the whole point.
          </p>
        ) : null}
      </Sticker>

      {/* Trend line */}
      <Sticker>
        <StickerHeading
          emoji="📈"
          title="The line"
          hint="Wobbles are normal. Watch the direction."
          action={
            <div className="flex gap-1">
              {RANGES.map((r) => (
                <Link
                  key={r.key}
                  href={`/progress?p=${period.key}&r=${r.key}`}
                  className={cn(
                    "flex min-h-11 items-center rounded-full px-3.5 text-xs font-bold transition-transform hover:-translate-y-0.5",
                    r.key === range.key
                      ? "bg-[var(--violet-solid)] text-white"
                      : "bg-[var(--muted)] text-[var(--ink-soft)]",
                  )}
                >
                  {r.label}
                </Link>
              ))}
            </div>
          }
        />
        <WeightChart
          points={chartPoints}
          targetKg={profile.targetWeightKg}
          units={profile.units}
        />
      </Sticker>

      {/* Am I improving */}
      <Sticker tint="violet">
        <StickerHeading
          emoji="🤔"
          title="Am I actually improving?"
          hint={`Last ${period.days} days vs the ${period.days} before`}
          action={
            <div className="flex gap-1">
              {PERIODS.map((p) => (
                <Link
                  key={p.key}
                  href={`/progress?p=${p.key}&r=${range.key}`}
                  className={cn(
                    "flex min-h-11 items-center rounded-full px-3.5 text-xs font-bold transition-transform hover:-translate-y-0.5",
                    p.key === period.key
                      ? "bg-[var(--violet-solid)] text-white"
                      : "bg-[var(--inset)] text-[var(--ink-soft)]",
                  )}
                >
                  {p.label}
                </Link>
              ))}
            </div>
          }
        />

        <ul className="grid gap-2.5 sm:grid-cols-2">
          {insights.map((insight) => (
            <li
              key={insight.id}
              className="flex items-start gap-3 rounded-3xl bg-[var(--inset)] px-4 py-3.5"
              style={{
                boxShadow: `0 3px 0 0 ${
                  insight.direction === "good"
                    ? "var(--mint-soft)"
                    : insight.direction === "bad"
                      ? "var(--peach-soft)"
                      : "var(--violet-soft)"
                }`,
              }}
            >
              <span className="text-xl leading-none" aria-hidden>
                {insight.icon}
              </span>
              <div className="min-w-0">
                {insight.metric ? (
                  <p
                    className="numeral text-lg leading-none"
                    style={{
                      color:
                        insight.direction === "good"
                          ? "var(--mint)"
                          : insight.direction === "bad"
                            ? "var(--peach)"
                            : "var(--violet)",
                    }}
                  >
                    {insight.metric}
                  </p>
                ) : null}
                <p className="mt-1 text-sm font-medium text-pretty text-[var(--ink-soft)]">
                  {insight.text}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <Squiggle />

        {/*
          The radar is gone. Five unlabelled axes with no scale, sitting
          directly under a table that gave the same five numbers exactly --
          it looked like analysis and answered nothing the row above had not.
        */}
        <div>
          <div className="overflow-x-auto" data-no-swipe>
            <table className="w-full text-sm">
              <thead>
                <tr className="label-cute text-left text-[0.55rem]">
                  <th className="pb-2 font-semibold">What</th>
                  {/* Dropped on a phone: Now and Change together say the
                      same thing, and keeping it clipped the Change column
                      clean off the edge of the card. */}
                  <th className="hidden pb-2 text-right font-semibold sm:table-cell">
                    Before
                  </th>
                  <th className="pb-2 text-right font-semibold">Now</th>
                  <th className="pb-2 text-right font-semibold">Change</th>
                </tr>
              </thead>
              <tbody>
                {comparisons.map((row) => {
                  const improved = row.invert ? row.delta < 0 : row.delta > 0;
                  const worse = row.invert ? row.delta > 0 : row.delta < 0;
                  return (
                    <tr key={row.label} className="border-t border-[var(--border)]">
                      <td className="py-2.5 font-semibold text-[var(--ink-soft)]">
                        {row.label}
                      </td>
                      <td className="numeral hidden py-2.5 text-right text-[var(--ink-soft)] sm:table-cell">
                        {row.before}
                      </td>
                      <td className="numeral py-2.5 text-right">{row.now}</td>
                      <td
                        className="numeral py-2.5 text-right"
                        style={{
                          color: improved
                            ? "var(--mint)"
                            : worse
                              ? "var(--peach)"
                              : "var(--ink-soft)",
                        }}
                      >
                        {row.delta === 0
                          ? "—"
                          : `${row.delta > 0 ? "+" : "−"}${Math.abs(round(row.delta, 1))}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <Squiggle />

        <p className="label-cute mb-3">Every day in this window</p>
        <WeekStrip series={series} />
      </Sticker>

      <Sticker tint="sky">
        <StickerHeading
          emoji="⚖️"
          title="Weigh-ins"
          hint={`${weights.length} reading${weights.length === 1 ? "" : "s"} so far`}
        />
        <WeightLogList logs={weights} units={profile.units} today={today} />
      </Sticker>
    </div>
  );
}
