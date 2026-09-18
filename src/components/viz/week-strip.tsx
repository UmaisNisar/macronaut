"use client";

import Link from "next/link";

import type { DaySeriesPoint } from "@/lib/insights";
import { STATUS_META } from "@/lib/nutrition";
import { relativeDayLabel, weekdayInitial } from "@/lib/date";
import { cn } from "@/lib/utils";

/**
 * A row of chunky candy bars, one per day, against a dashed target line.
 * Height is calories, colour is how the day went. Tapping one opens that day.
 */
export function WeekStrip({
  series,
  className,
  linkDays = true,
  height = 118,
}: {
  series: DaySeriesPoint[];
  className?: string;
  linkDays?: boolean;
  height?: number;
}) {
  const ceiling =
    Math.max(...series.map((d) => Math.max(d.calories, d.target)), 1) * 1.15;
  const pctOf = (v: number) => (v / ceiling) * 100;
  const targetPct = pctOf(series.at(-1)?.target ?? 2000);

  return (
    <div className={cn("relative", className)}>
      <div className="relative" style={{ height }}>
        {/* target line */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dashed border-[var(--track)]"
          style={{ bottom: `${targetPct}%` }}
        >
          <span className="label-cute absolute -top-[9px] right-0 rounded-full bg-[var(--inset)] px-1.5 text-[0.55rem] text-[var(--violet)]">
            goal
          </span>
        </div>

        <div className="absolute inset-0 flex items-end gap-1.5 sm:gap-2">
          {series.map((day) => {
            const meta = STATUS_META[day.status];
            const h = day.logged ? Math.max(6, pctOf(day.calories)) : 6;
            const title = `${relativeDayLabel(day.iso)} — ${
              day.logged
                ? `${Math.round(day.calories)} kcal, ${meta.label}`
                : "nothing logged"
            }`;

            const bar = (
              /* Drawn at full height. These used to grow out of the floor
                 one after another, which is charming once and restless every
                 time you open the tab afterwards. */
              <span
                className="relative block w-full rounded-[14px]"
                style={{
                  height: `${h}%`,
                  background: day.logged
                    ? `linear-gradient(180deg, color-mix(in oklab, ${meta.token} 78%, var(--card)), ${meta.token})`
                    : "var(--muted)",
                }}
              >
                {day.logged && day.status === "great" ? (
                  <span
                    className="absolute -top-5 left-1/2 -translate-x-1/2 text-[0.7rem]"
                    aria-hidden
                  >
                    🔥
                  </span>
                ) : null}
              </span>
            );

            return linkDays ? (
              <Link
                key={day.iso}
                href={`/history?d=${day.iso}`}
                title={title}
                aria-label={title}
                className="flex h-full flex-1 items-end rounded-[14px] transition-transform hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--violet)]"
              >
                {bar}
              </Link>
            ) : (
              <span
                key={day.iso}
                title={title}
                className="flex h-full flex-1 items-end"
              >
                {bar}
              </span>
            );
          })}
        </div>
      </div>

      <div className="mt-2 flex gap-1.5 sm:gap-2">
        {series.map((day) => (
          <span
            key={day.iso}
            className="label-cute flex-1 text-center text-[0.58rem]"
          >
            {weekdayInitial(day.iso)}
          </span>
        ))}
      </div>
    </div>
  );
}
