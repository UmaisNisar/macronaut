"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { ChevronDown, Loader2, Trash2 } from "lucide-react";

import type { UnitSystem, WeightLog } from "@/lib/schemas";
import { formatWeight, round } from "@/lib/nutrition";
import { relativeDayLabel, shortDayLabel, type Iso } from "@/lib/date";
import { deleteWeightAction } from "@/server/actions";
import { EmptyNest } from "@/components/kit";
import { SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function WeightLogList({
  logs,
  units,
  today,
}: {
  logs: WeightLog[];
  units: UnitSystem;
  today: Iso;
}) {
  if (!logs.length) {
    return (
      <EmptyNest mood="curious" title="No weigh-ins yet">
        Pop one in and Momo will start drawing your line.
      </EmptyNest>
    );
  }

  // Newest first, each row carrying the change from the reading before it.
  const rows = [...logs].reverse().map((log, i, arr) => {
    const older = arr[i + 1];
    return { log, delta: older ? round(log.weightKg - older.weightKg, 1) : null };
  });

  return (
    <ul className="space-y-2">
      <AnimatePresence initial={false}>
        {rows.map(({ log, delta }, i) => (
          <WeightRow
            key={log.id}
            log={log}
            delta={delta}
            units={units}
            today={today}
            index={i}
          />
        ))}
      </AnimatePresence>
    </ul>
  );
}

function WeightRow({
  log,
  delta,
  units,
  today,
  index,
}: {
  log: WeightLog;
  delta: number | null;
  units: UnitSystem;
  today: Iso;
  index: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const hasDetail = Boolean(log.coach || log.note);

  const down = delta !== null && delta < 0;
  const up = delta !== null && delta > 0;

  function remove() {
    startTransition(async () => {
      const result = await deleteWeightAction(log.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast("Reading removed");
      router.refresh();
    });
  }

  return (
    <motion.li
      layout
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: pending ? 0.4 : 1, scale: 1 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ ...SPRING.pop, delay: Math.min(index * 0.03, 0.25) }}
      className="sticker-flat group px-3.5 py-2.5"
      style={{
        ["--lip" as string]: down
          ? "var(--mint-soft)"
          : up
            ? "var(--peach-soft)"
            : "var(--track)",
      }}
    >
      <div className="flex items-center gap-3">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-2xl text-base"
          style={{
            background: down
              ? "var(--mint-soft)"
              : up
                ? "var(--peach-soft)"
                : "var(--muted)",
          }}
          aria-hidden
        >
          {down ? "📉" : up ? "📈" : "⚖️"}
        </span>

        <div className="min-w-0 flex-1">
          <p className="numeral text-base leading-none">
            {formatWeight(log.weightKg, units)}
          </p>
          <p className="label-cute mt-1 text-[0.55rem]">
            {shortDayLabel(log.loggedOn)} · {relativeDayLabel(log.loggedOn, today)}
          </p>
        </div>

        {delta !== null ? (
          <span
            className="numeral rounded-full px-2.5 py-1 text-xs"
            style={{
              background: down
                ? "var(--mint-soft)"
                : up
                  ? "var(--peach-soft)"
                  : "var(--muted)",
              color: down
                ? "var(--mint-text)"
                : up
                  ? "var(--peach-text)"
                  : "var(--ink-soft)",
            }}
          >
            {delta === 0 ? "same" : `${down ? "−" : "+"}${Math.abs(delta)} kg`}
          </span>
        ) : (
          <span className="label-cute text-[0.55rem]">first!</span>
        )}

        {hasDetail ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="grid size-10 place-items-center rounded-full text-[var(--ink-soft)] transition-colors hover:text-[var(--violet)] sm:size-8"
            aria-expanded={open}
            aria-label="Show Momo's note"
          >
            <ChevronDown
              className={cn("size-4 transition-transform", open && "rotate-180")}
            />
          </button>
        ) : null}

        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="grid size-10 place-items-center rounded-full text-[var(--ink-soft)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--destructive)] sm:size-8"
          aria-label={`Delete reading from ${log.loggedOn}`}
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Trash2 className="size-3.5" />
          )}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && hasDetail ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2.5 rounded-2xl bg-[var(--muted)] px-3.5 py-3">
              {log.note ? (
                <p className="text-xs font-medium text-[var(--ink-soft)] italic">
                  &ldquo;{log.note}&rdquo;
                </p>
              ) : null}
              {log.coach ? (
                <>
                  <p className="mt-1 text-sm font-bold">{log.coach.headline}</p>
                  <p className="mt-1 text-xs leading-relaxed font-medium text-[var(--ink-soft)]">
                    {log.coach.message}
                  </p>
                </>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.li>
  );
}
