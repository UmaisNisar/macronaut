import Link from "next/link";

import type { WeekBudget } from "@/lib/insights";
import { shortDayLabel, WEEKDAY_INITIALS } from "@/lib/date";
import { cn } from "@/lib/utils";

/** Height of the bar row, in px — see the note where the bars are drawn. */
const BAR_AREA = 64;

/**
 * The week as one budget.
 *
 * A single day's target can only ever say "you went over"; it cannot say what
 * that means for Thursday. Eating is not settled daily — a big Saturday is
 * fine if the week absorbs it — so this shows what is left of the week and,
 * more usefully, what the days that remain have to average to land on it.
 *
 * The headline is deliberately the per-day number rather than the total left.
 * "4,000 remaining" still needs dividing by however many days are left before
 * it means anything at the fridge; "1,000 a day" is already the answer.
 */
export function WeekBudgetCard({ week }: { week: WeekBudget }) {
  const {
    weekTarget,
    eaten,
    remaining,
    daysLeft,
    perDayLeft,
    balance,
    unloggedPast,
    todayTarget,
    days,
  } = week;

  const over = remaining <= 0;
  // "Normal" means within 100 kcal of the usual day — closer than anyone eats
  // to a number, so not worth calling an adjustment.
  const gap = todayTarget - perDayLeft;
  const roomy = gap <= 100;

  const pct = Math.min(100, Math.max(0, (eaten / Math.max(1, weekTarget)) * 100));
  const ceiling = Math.max(...days.map((d) => Math.max(d.calories, d.target)), 1);
  // Settled = finished days. On a Monday there are none, and telling someone
  // they are level "through yesterday" would be describing last week.
  const settledDays = days.filter((d) => !d.isFuture && !d.isToday).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="label-cute">
          This week · {shortDayLabel(week.startIso)} – {shortDayLabel(week.endIso)}
        </p>
        <p className="text-xs font-semibold text-[var(--ink-soft)]">
          <span className="numeral text-[var(--ink)]">
            {eaten.toLocaleString()}
          </span>{" "}
          of {weekTarget.toLocaleString()} kcal
        </p>
      </div>

      {/* Week spent so far. The bar is the week, not the day. */}
      <div className="h-3.5 overflow-hidden rounded-full bg-[var(--track)]">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{
            width: `${pct}%`,
            background: over
              ? "linear-gradient(90deg, var(--peach), var(--destructive))"
              : "linear-gradient(90deg, var(--violet), var(--sky))",
          }}
        />
      </div>

      {/* The number you actually act on. */}
      <div
        className={cn(
          "mt-3.5 rounded-2xl px-4 py-3",
          over ? "bg-[var(--peach-soft)]" : "bg-[var(--inset)]",
        )}
      >
        {over ? (
          <>
            <p className="numeral text-2xl leading-none text-[var(--peach-text)]">
              {Math.abs(remaining).toLocaleString()} over
            </p>
            <p className="mt-1.5 text-xs leading-relaxed font-medium text-[var(--ink-soft)]">
              The week&rsquo;s budget is spent with {daysLeft}{" "}
              {daysLeft === 1 ? "day" : "days"} still to come. Going lighter
              from here still lands the week closer than letting it run.
            </p>
          </>
        ) : (
          <>
            <p className="numeral text-2xl leading-none text-[var(--violet)]">
              {perDayLeft.toLocaleString()}
              <span className="ml-1 text-sm font-semibold text-[var(--ink-soft)]">
                kcal a day
              </span>
            </p>
            <p className="mt-1.5 text-xs leading-relaxed font-medium text-[var(--ink-soft)]">
              for the {daysLeft === 1 ? "rest of today" : `${daysLeft} days left`}
              {roomy
                ? " — about your usual, so nothing to make up."
                : `, which is ${gap.toLocaleString()} under your usual ${todayTarget.toLocaleString()}.`}
            </p>
          </>
        )}
      </div>

      {/* Seven bars: what the week looks like, and where today sits in it. */}
      <div className="mt-4 flex items-end gap-1.5">
        {days.map((d, i) => {
          /*
           * Pixel heights, not percentages. A percentage height resolves
           * against the parent's height, and the parent here is a flex item
           * with no definite height of its own — so every bar computed to
           * zero and the row rendered as a line of labels under nothing.
           */
          const h = d.logged
            ? Math.max(6, Math.round((d.calories / ceiling) * BAR_AREA))
            : 6;
          const hot = d.calories > d.target;
          return (
            <div key={d.iso} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="flex w-full items-end"
                style={{ height: BAR_AREA }}
              >
                <div
                  className={cn(
                    "w-full rounded-[10px]",
                    d.isFuture
                      ? "bg-[var(--track)]"
                      : !d.logged
                        ? "bg-[var(--muted)]"
                        : hot
                          ? "bg-[var(--peach)]"
                          : "bg-[var(--violet)]",
                    d.isToday &&
                      "ring-2 ring-[var(--violet)] ring-offset-1 ring-offset-[var(--card)]",
                  )}
                  style={{ height: h }}
                  title={`${shortDayLabel(d.iso)} — ${
                    d.isFuture
                      ? "still to come"
                      : d.logged
                        ? `${Math.round(d.calories).toLocaleString()} of ${Math.round(d.target).toLocaleString()} kcal`
                        : "nothing logged"
                  }`}
                />
              </div>
              <span
                className={cn(
                  "text-[0.6rem] font-bold",
                  d.isToday ? "text-[var(--violet)]" : "text-[var(--ink-soft)]",
                )}
              >
                {WEEKDAY_INITIALS[i]}
              </span>
            </div>
          );
        })}
      </div>

      {/* Where the finished days actually left you. */}
      <p className="mt-2.5 text-xs font-semibold text-[var(--ink-soft)]">
        {settledDays === 0
          ? "Fresh week — nothing settled yet."
          : balance === 0
            ? "Level with plan through yesterday."
            : balance > 0
              ? `${balance.toLocaleString()} over plan through yesterday.`
              : `${Math.abs(balance).toLocaleString()} under plan through yesterday.`}
      </p>

      {unloggedPast > 0 ? (
        <p className="mt-1.5 text-xs leading-relaxed font-medium text-[var(--peach-text)]">
          {unloggedPast} {unloggedPast === 1 ? "day" : "days"} this week had
          nothing logged, and they count as zero — so this allowance is more
          generous than it should be.{" "}
          <Link href="/history" className="underline underline-offset-2">
            Fill them in
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
