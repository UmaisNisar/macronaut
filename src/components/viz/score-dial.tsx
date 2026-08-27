"use client";

import { motion, useReducedMotion } from "motion/react";

import { arcPath } from "@/lib/geometry";
import { clamp, STATUS_META } from "@/lib/nutrition";
import type { DayStatus } from "@/lib/schemas";
import { AnimatedNumber } from "@/components/viz/animated-number";
import { cn } from "@/lib/utils";

const SWEEP = 240;
const START = -120;

export function ScoreDial({
  score,
  status,
  size = 116,
  className,
}: {
  score: number;
  status: DayStatus;
  size?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const meta = STATUS_META[status];
  const pct = clamp(score / 100, 0, 1);
  const c = 60;
  const r = 44;

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 120 120" className="h-full w-full overflow-visible">
        <path
          d={arcPath(c, c, r, START, START + SWEEP)}
          fill="none"
          stroke="var(--track)"
          strokeWidth={13}
          strokeLinecap="round"
        />
        <motion.path
          d={arcPath(c, c, r, START, START + SWEEP)}
          fill="none"
          stroke={meta.token}
          strokeWidth={13}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1 1"
          initial={reduce ? false : { strokeDashoffset: 1 }}
          animate={{ strokeDashoffset: 1 - pct }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          style={{
            filter: `drop-shadow(0 0 8px color-mix(in oklab, ${meta.token} 42%, transparent))`,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="numeral text-2xl leading-none"
          style={{ color: meta.token }}
        >
          <AnimatedNumber value={score} />
        </span>
        <span className="label-cute mt-0.5 text-[0.5rem]">score</span>
      </div>
    </div>
  );
}
