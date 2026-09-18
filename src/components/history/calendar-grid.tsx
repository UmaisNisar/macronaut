"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { DailyLog } from "@/lib/schemas";
import {
  addMonths,
  isSameMonth,
  type Iso,
  monthGrid,
  monthLabel,
  WEEKDAY_INITIALS,
} from "@/lib/date";
import { STATUS_META } from "@/lib/nutrition";
import { SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * A month as a sheet of stickers. Every logged day wears the face of how it
 * went, so a month reads as a mood before you read a single number.
 */
export function CalendarGrid({
  monthIso,
  selectedIso,
  todayIso,
  days,
}: {
  monthIso: Iso;
  selectedIso: Iso;
  todayIso: Iso;
  days: DailyLog[];
}) {
  const byDate = new Map(days.map((d) => [d.logDate, d]));
  const cells = monthGrid(monthIso);
  const prev = addMonths(monthIso, -1);
  const next = addMonths(monthIso, 1);
  const nextIsFuture = next > todayIso && !isSameMonth(next, todayIso);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Link
          href={`/history?d=${selectedIso}&m=${prev}`}
          className="grid size-11 place-items-center rounded-full bg-[var(--muted)] text-[var(--ink-soft)] transition-transform hover:-translate-y-0.5 hover:text-[var(--violet)] active:scale-90 sm:size-9"
          aria-label="Previous month"
        >
          <ChevronLeft className="size-4" />
        </Link>

        <h2 className="text-base font-bold">{monthLabel(monthIso)}</h2>

        {nextIsFuture ? (
          <span className="size-11 sm:size-9" aria-hidden />
        ) : (
          <Link
            href={`/history?d=${selectedIso}&m=${next}`}
            className="grid size-11 place-items-center rounded-full bg-[var(--muted)] text-[var(--ink-soft)] transition-transform hover:-translate-y-0.5 hover:text-[var(--violet)] active:scale-90 sm:size-9"
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </Link>
        )}
      </div>

      <div className="mb-2 grid grid-cols-7 gap-1.5">
        {WEEKDAY_INITIALS.map((initial, i) => (
          <span key={i} className="label-cute text-center text-[0.55rem]">
            {initial}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((iso) => {
          const day = byDate.get(iso);
          const outside = !isSameMonth(iso, monthIso);
          const future = iso > todayIso;
          const selected = iso === selectedIso;
          const isToday = iso === todayIso;
          const logged = (day?.entryCount ?? 0) > 0;
          const meta = STATUS_META[day?.status ?? "unlogged"];

          const inner = (
            <>
              <span
                className={cn(
                  "numeral text-[0.7rem] leading-none",
                  selected ? "text-white" : outside || future ? "opacity-35" : "",
                )}
              >
                {Number(iso.slice(8))}
              </span>
              <span className="mt-auto text-[0.85rem] leading-none" aria-hidden>
                {logged ? meta.emoji : ""}
              </span>
            </>
          );

          const base = cn(
            "flex aspect-square flex-col items-center justify-between rounded-2xl p-1.5 transition-colors",
            selected
              ? "bg-[var(--violet-solid)] text-white shadow-[0_3px_0_0_var(--primary-lip)]"
              : logged
                ? "shadow-[0_2px_0_0_rgb(0_0_0_/_0.04)]"
                : "bg-[var(--muted)]",
            isToday && !selected && "ring-2 ring-[var(--violet)] ring-offset-1",
            (outside || future) && "opacity-45",
          );

          const style =
            logged && !selected
              ? { background: `color-mix(in oklab, ${meta.token} 24%, var(--card))` }
              : undefined;

          if (future) {
            return (
              <span key={iso} className={base} style={style} aria-hidden>
                {inner}
              </span>
            );
          }

          return (
            /* The grid is drawn, not dealt out: a month of cells springing
               in one after another replayed on every visit to the Journal.
               Hover and press still respond. */
            <motion.div
              key={iso}
              whileHover={{ y: -3, scale: 1.06 }}
              whileTap={{ scale: 0.92 }}
              transition={SPRING.pop}
            >
              <Link
                href={`/history?d=${iso}&m=${monthIso}`}
                className={cn(base, "block w-full")}
                style={style}
                aria-current={selected ? "date" : undefined}
                title={
                  logged
                    ? `${iso}: ${Math.round(day!.totals.calories)} kcal — ${meta.label}`
                    : `${iso}: nothing logged`
                }
              >
                <span className="flex h-full w-full flex-col items-center justify-between">
                  {inner}
                </span>
              </Link>
            </motion.div>
          );
        })}
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-3 gap-y-1.5">
        {(["great", "solid", "over", "under"] as const).map((status) => (
          <li key={status} className="flex items-center gap-1">
            <span aria-hidden className="text-xs">
              {STATUS_META[status].emoji}
            </span>
            <span className="label-cute text-[0.55rem]">
              {STATUS_META[status].label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
