"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { motion } from "motion/react";
import { RefreshCw } from "lucide-react";

import type { AiCoachNote, CoachTone } from "@/lib/schemas";
import type { Iso } from "@/lib/date";
import { ensureDailyCoachAction } from "@/server/actions";
import { MomoSays } from "@/components/mascot/momo-says";
import type { Mood } from "@/components/mascot/momo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tint = "violet" | "mint" | "peach" | "sun" | "sky";

const TONE: Record<CoachTone, { mood: Mood; tint: Tint; tintClass: string }> = {
  celebrate: { mood: "celebrating", tint: "mint", tintClass: "tint-mint" },
  steady: { mood: "idle", tint: "violet", tintClass: "tint-violet" },
  nudge: { mood: "curious", tint: "peach", tintClass: "tint-peach" },
  care: { mood: "caring", tint: "sky", tintClass: "tint-sky" },
};

export function CoachPanel({
  date,
  initialCoach,
  stale,
  hasEntries,
  /** Past days do not spend an API call just because you looked at them. */
  autoGenerate = true,
  className,
}: {
  date: Iso;
  initialCoach: AiCoachNote | null;
  stale: boolean;
  hasEntries: boolean;
  autoGenerate?: boolean;
  className?: string;
}) {
  const [coach, setCoach] = useState(initialCoach);
  const [syncedFrom, setSyncedFrom] = useState(initialCoach);
  const [pending, startTransition] = useTransition();
  const requested = useRef<string | null>(null);

  // Follow a newer server-supplied note without an effect round-trip.
  if (initialCoach !== syncedFrom) {
    setSyncedFrom(initialCoach);
    setCoach(initialCoach);
  }

  const run = (force: boolean) =>
    startTransition(async () => {
      const result = await ensureDailyCoachAction(date, force);
      if (result.ok) setCoach(result.coach);
    });

  useEffect(() => {
    if (!hasEntries || !autoGenerate) return;
    const needs = stale || !initialCoach;
    const key = `${date}:${stale}`;
    if (!needs || requested.current === key) return;
    requested.current = key;
    run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, stale, hasEntries, initialCoach, autoGenerate]);

  if (!hasEntries) {
    return (
      <div className={cn("sticker tint-violet p-4 sm:p-5", className)}>
        <MomoSays
          mood="curious"
          tone="violet"
          size={78}
          title="Psst… what did we eat today? 👀"
        >
          Tell me up there and I&rsquo;ll work out the numbers, then let you know
          how the day is actually going.
        </MomoSays>
      </div>
    );
  }

  const tone = TONE[coach?.tone ?? "steady"];
  const loading = pending && !coach;

  return (
    <div className={cn("sticker relative p-4 sm:p-5", tone.tintClass, className)}>
      <div className="mb-2 flex items-center justify-between">
        <p className="label-cute">Your little coach says…</p>
        <button
          type="button"
          onClick={() => run(true)}
          disabled={pending}
          className="grid size-10 place-items-center rounded-full text-[var(--ink-soft)] transition-transform hover:-translate-y-0.5 hover:text-[var(--violet)] active:scale-90 disabled:opacity-40 sm:size-8"
          aria-label="Ask Momo again"
          title="Ask Momo again"
        >
          <motion.span
            animate={{ rotate: pending ? 360 : 0 }}
            transition={{
              duration: 1,
              repeat: pending ? Infinity : 0,
              ease: "linear",
            }}
          >
            <RefreshCw className="size-4" />
          </motion.span>
        </button>
      </div>

      <MomoSays
        mood={tone.mood}
        tone={tone.tint}
        size={86}
        loading={loading}
        bubbleKey={coach?.headline}
        title={coach?.headline}
        footer={
          coach?.nextMove ? (
            <p className="rounded-2xl bg-[var(--inset)]/80 px-3.5 py-2.5 text-sm font-semibold">
              <span className="mr-1.5" aria-hidden>
                🎯
              </span>
              {coach.nextMove}
            </p>
          ) : null
        }
      >
        {coach?.message}
      </MomoSays>

      {!coach && !loading && !autoGenerate ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => run(true)}
          disabled={pending}
        >
          Ask Momo about this day
        </Button>
      ) : null}
    </div>
  );
}
