"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";

import { repeatFoodAction } from "@/server/actions";
import { Haptic } from "@/components/ui/haptic";
import { EASE } from "@/lib/motion";
import type { FrequentFood } from "@/lib/db/store";
import type { Iso } from "@/lib/date";

/**
 * One-tap repeats for the things you actually eat.
 *
 * Most days are made of the same handful of meals, and describing porridge to
 * an AI for the fortieth time is pure friction — it costs typing, a model call
 * and a few seconds of waiting for a number the app already worked out. These
 * chips copy a previous entry straight into today.
 *
 * `data-no-swipe` matters: the strip scrolls sideways, and without it dragging
 * through your usuals would flick you to the next tab instead.
 */
export function QuickRepeat({
  foods,
  date,
}: {
  foods: FrequentFood[];
  date: Iso;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!foods.length) return null;

  function repeat(food: FrequentFood) {
    if (pending) return;
    setBusyId(food.entryId);
    setError(null);
    startTransition(async () => {
      const result = await repeatFoodAction({ sourceId: food.entryId, date });
      setBusyId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setJustAdded(food.entryId);
      setTimeout(() => setJustAdded(null), 1400);
      router.refresh();
    });
  }

  return (
    <div className="mb-3">
      <p className="label-cute mb-2 px-1">Log again</p>

      <div
        data-no-swipe
        className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {foods.map((food) => {
          const busy = busyId === food.entryId;
          const added = justAdded === food.entryId;
          return (
            <Haptic key={food.entryId} className="shrink-0 snap-start">
              <motion.button
                type="button"
                onClick={() => repeat(food)}
                disabled={pending}
                animate={added ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                transition={{ duration: 0.35, ease: EASE.glide }}
                className="sticker-flat flex items-center gap-2 rounded-full py-2 pr-3.5 pl-3 text-left transition-opacity disabled:opacity-50"
              >
                <span className="text-lg leading-none" aria-hidden>
                  {added ? "✅" : busy ? "⏳" : food.emoji}
                </span>
                <span className="min-w-0">
                  <span className="block max-w-[9.5rem] truncate text-xs leading-tight font-bold">
                    {food.name}
                  </span>
                  <span className="numeral block text-[0.65rem] leading-tight text-[var(--ink-soft)]">
                    {added ? "added!" : `${Math.round(food.calories)} kcal`}
                  </span>
                </span>
              </motion.button>
            </Haptic>
          );
        })}
      </div>

      {error ? (
        <p className="mt-1.5 px-1 text-xs font-semibold text-[var(--peach)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
