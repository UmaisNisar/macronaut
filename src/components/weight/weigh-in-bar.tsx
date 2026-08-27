import { relativeDayLabel, type Iso } from "@/lib/date";
import { formatWeight, formatWeightDelta } from "@/lib/nutrition";
import { LogWeightDialog } from "@/components/weight/log-weight-dialog";
import { Sticker } from "@/components/kit";
import type { UnitSystem, WeightLog } from "@/lib/schemas";

/**
 * Weighing in is a once-a-day action, so it sits near the top of Today rather
 * than buried under the food log — but it only takes up room while it is still
 * outstanding. Once the number is in, it collapses to a quiet readout. That way
 * the loud version always means "there is something to do here", instead of
 * becoming wallpaper the eye learns to skip.
 */
export function WeighInBar({
  today,
  units,
  currentKg,
  latest,
  previous,
}: {
  today: Iso;
  units: UnitSystem;
  currentKg: number;
  latest: WeightLog | null;
  previous: WeightLog | null;
}) {
  if (latest && latest.loggedOn === today) {
    // Against the previous entry, so "today" compares to the last time you
    // stood on the scale rather than to some rolling average.
    const delta = previous ? latest.weightKg - previous.weightKg : null;

    return (
      <LogWeightDialog
        today={today}
        units={units}
        currentKg={currentKg}
        previousKg={previous?.weightKg ?? null}
        trigger={
          <button
            type="button"
            className="sticker-flat tappable flex w-full items-center gap-3 px-4 py-3 text-left"
          >
            <span className="text-xl leading-none" aria-hidden>
              ⚖️
            </span>
            <span className="numeral text-base leading-none">
              {formatWeight(latest.weightKg, units)}
            </span>
            <span className="label-cute text-[0.5rem]">today</span>

            {delta !== null && Math.abs(delta) >= 0.05 ? (
              <span
                className="numeral rounded-full px-2 py-1 text-[0.7rem] leading-none"
                style={{
                  background: `color-mix(in oklab, ${delta < 0 ? "var(--mint)" : "var(--sky)"} 16%, var(--card))`,
                  color: `color-mix(in oklab, ${delta < 0 ? "var(--mint)" : "var(--sky)"} 82%, var(--ink))`,
                }}
              >
                {formatWeightDelta(delta, units)}
              </span>
            ) : null}

            <span className="ml-auto shrink-0 text-xs font-bold text-[var(--ink-soft)]">
              Update
            </span>
          </button>
        }
      />
    );
  }

  const subtitle = latest
    ? `Last ${formatWeight(latest.weightKg, units)} · ${relativeDayLabel(latest.loggedOn, today).toLowerCase()}`
    : "Your first number starts the journey";

  return (
    <Sticker tint="peach" inset={false} animate={false} className="px-4 py-3.5">
      <LogWeightDialog
        today={today}
        units={units}
        currentKg={currentKg}
        previousKg={previous?.weightKg ?? null}
        trigger={
          <button
            type="button"
            className="tappable -m-1 flex w-full items-center gap-3 rounded-3xl p-1 text-left"
          >
            <span className="text-2xl leading-none" aria-hidden>
              ⚖️
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm leading-tight font-bold">
                Time to weigh in
              </span>
              <span className="mt-0.5 block truncate text-xs font-medium text-[var(--ink-soft)]">
                {subtitle}
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-[var(--peach)] px-4 py-2 text-sm font-bold text-white shadow-[0_3px_0_0_rgb(0_0_0/0.15)]">
              Weigh in
            </span>
          </button>
        }
      />
    </Sticker>
  );
}
