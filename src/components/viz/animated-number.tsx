"use client";

import { useEffect, useRef } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";

type Props = {
  value: number;
  decimals?: number;
  /** Prepends "+" for positive values — used for deltas. */
  signed?: boolean;
  duration?: number;
  className?: string;
};

/**
 * Counts from the previous value to the new one. Every number that can change
 * while the user is looking at it goes through this, so the whole app feels
 * like one instrument reacting rather than a page re-rendering.
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  signed = false,
  duration = 0.9,
  className,
}: Props) {
  const reduce = useReducedMotion();
  const motionValue = useMotionValue(value);
  const previous = useRef(value);

  const text = useTransform(motionValue, (v) => {
    const rounded = decimals > 0 ? v.toFixed(decimals) : Math.round(v).toString();
    const withSeparators = rounded.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    if (!signed) return withSeparators;
    if (v > 0) return `+${withSeparators}`;
    if (v < 0) return withSeparators.replace("-", "−");
    return withSeparators;
  });

  useEffect(() => {
    if (reduce) {
      motionValue.set(value);
      previous.current = value;
      return;
    }
    const controls = animate(motionValue, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
    });
    previous.current = value;
    return () => controls.stop();
  }, [value, duration, motionValue, reduce]);

  return <motion.span className={className}>{text}</motion.span>;
}
