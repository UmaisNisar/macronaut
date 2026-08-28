"use client";

import { useEffect, useRef } from "react";

import { useCelebration } from "@/components/celebrate/celebration";
import { isOnTarget } from "@/lib/nutrition";
import type { Iso } from "@/lib/date";

/**
 * Marks the moment the day lands on target.
 *
 * The app celebrated a first meal, an unlocked badge and a weight milestone,
 * but never the thing it is actually for — `isOnTarget` existed only to feed
 * streaks and insights, so hitting your number produced no acknowledgement at
 * all. A tester noticed before we did.
 *
 * Fires once per day. "On target" uses the same band as streaks and the
 * journey stats rather than a second definition, so the celebration and the
 * history can never disagree about whether a day counted.
 */

const KEY = "macronaut:target-celebrated";

/**
 * Remembered per device rather than per account.
 *
 * Storing it server-side would mean a write on every page load that happens to
 * cross the line, to prevent a confetti burst that is only ever mildly
 * repeated. Seeing it twice across two devices is a much smaller problem than
 * that.
 */
function alreadyCelebrated(date: Iso): boolean {
  try {
    return localStorage.getItem(KEY) === date;
  } catch {
    // Private mode. It may celebrate again later; nobody is harmed.
    return false;
  }
}

function remember(date: Iso) {
  try {
    localStorage.setItem(KEY, date);
  } catch {
    /* ignore */
  }
}

export function TargetReached({
  date,
  calories,
  target,
  protein,
  proteinTarget,
}: {
  date: Iso;
  calories: number;
  target: number;
  protein: number;
  proteinTarget: number;
}) {
  const { celebrate } = useCelebration();
  const fired = useRef(false);

  const onTarget = isOnTarget(calories, target);
  const proteinMet = proteinTarget > 0 && protein >= proteinTarget * 0.9;

  useEffect(() => {
    if (!onTarget || fired.current || alreadyCelebrated(date)) return;
    fired.current = true;
    remember(date);

    celebrate({
      title: "Target hit 🎯",
      detail: proteinMet
        ? "Calories and protein both where you wanted them."
        : "Right in the band you were aiming for.",
      emoji: "🎯",
      intensity: "big",
    });
  }, [onTarget, proteinMet, date, celebrate]);

  return null;
}
