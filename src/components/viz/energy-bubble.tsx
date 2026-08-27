"use client";

import { useId } from "react";
import { motion, useReducedMotion } from "motion/react";

import { clamp } from "@/lib/nutrition";
import { AnimatedNumber } from "@/components/viz/animated-number";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Today's energy, as a jar of liquid rather than a progress ring.
 *
 * The level rises with what you have eaten, two offset waves slosh across the
 * surface, and bubbles drift up through it. Going over target turns the liquid
 * warm and pushes the level past the brim instead of clipping — how far over
 * is exactly the thing a calorie tracker must not hide.
 */

const SIZE = 220;
const CX = 110;
const CY = 110;
const R = 92;
const TOP = CY - R;
const BOTTOM = CY + R;

/** One repeating wave surface, drawn twice as wide so it can loop seamlessly. */
function wavePath(y: number, amp: number, period: number) {
  const half = period / 2;
  let d = `M 0 ${y}`;
  for (let x = 0; x < SIZE * 2; x += period) {
    d += ` q ${half / 2} ${-amp} ${half} 0 q ${half / 2} ${amp} ${half} 0`;
  }
  return `${d} L ${SIZE * 2} ${BOTTOM + 20} L 0 ${BOTTOM + 20} Z`;
}

export function EnergyBubble({
  calories,
  target,
  className,
}: {
  calories: number;
  target: number;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const reduce = useReducedMotion();

  const safeTarget = Math.max(1, target);
  const ratio = calories / safeTarget;
  const over = ratio > 1;
  // Past the brim we keep filling, but slowly, so 200% still reads as "a lot".
  const level = clamp(over ? 1 + Math.min(0.08, (ratio - 1) * 0.16) : ratio, 0, 1.08);

  const surfaceY = BOTTOM - level * (BOTTOM - TOP);
  const remaining = Math.round(target - calories);

  const tint = over
    ? { a: "#FFB07A", b: "#FF8A5C", glow: "#FF9A5C" }
    : { a: "#FFD9A8", b: "#FF9A5C", glow: "#FFB877" };

  return (
    <div
      className={cn("relative mx-auto w-full max-w-[240px]", className)}
      role="img"
      aria-label={`${Math.round(calories)} of ${target} calories eaten. ${
        over ? `${Math.abs(remaining)} over` : `${remaining} left`
      }.`}
    >
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full overflow-visible">
        <defs>
          <clipPath id={`${uid}-jar`}>
            <circle cx={CX} cy={CY} r={R} />
          </clipPath>
          <radialGradient id={`${uid}-plate`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--card)" stopOpacity="0.92" />
            <stop offset="68%" stopColor="var(--card)" stopOpacity="0.88" />
            <stop offset="100%" stopColor="var(--card)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${uid}-liquid`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tint.a} />
            <stop offset="100%" stopColor={tint.b} />
          </linearGradient>
        </defs>

        {/* jar body */}
        <circle cx={CX} cy={CY} r={R} fill="var(--track)" />

        <g clipPath={`url(#${uid}-jar)`}>
          {/* back wave */}
          <motion.g
            animate={{ x: reduce ? 0 : [0, -110] }}
            transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
          >
            <motion.path
              d={wavePath(0, 7, 110)}
              fill={`url(#${uid}-liquid)`}
              opacity={0.45}
              initial={false}
              animate={{ y: surfaceY + 4 }}
              transition={{ duration: 1.1, ease: EASE.glide }}
            />
          </motion.g>

          {/* front wave */}
          <motion.g
            animate={{ x: reduce ? 0 : [0, -88] }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          >
            <motion.path
              d={wavePath(0, 5, 88)}
              fill={`url(#${uid}-liquid)`}
              stroke="var(--card)"
              strokeWidth={2.5}
              strokeOpacity={0.65}
              initial={false}
              animate={{ y: surfaceY }}
              transition={{ duration: 1.1, ease: EASE.glide }}
            />
          </motion.g>

          {/* bubbles */}
          {calories > 0 &&
            !reduce &&
            [0, 1, 2, 3, 4].map((i) => {
              const x = 48 + i * 30 + (i % 2) * 8;
              const r = 3 + (i % 3);
              return (
                <motion.circle
                  key={i}
                  cx={x}
                  r={r}
                  fill="#fff"
                  opacity={0.5}
                  animate={{
                    cy: [BOTTOM - 6, surfaceY + 8],
                    opacity: [0, 0.55, 0],
                  }}
                  transition={{
                    duration: 3 + i * 0.6,
                    repeat: Infinity,
                    delay: i * 0.7,
                    ease: "easeOut",
                  }}
                />
              );
            })}
        </g>

        {/* glass shine — always light; it is a highlight, not a surface */}
        <ellipse
          cx={CX - 34}
          cy={CY - 44}
          rx={16}
          ry={26}
          fill="#ffffff"
          opacity="0.4"
          transform={`rotate(-24 ${CX - 34} ${CY - 44})`}
        />

        {/*
          Frosted label plate. The readout sits over liquid when the jar is
          full and over glass when it is empty, so neither ink colour works on
          its own — give it its own ground instead.
        */}
        <circle cx={CX} cy={CY} r={72} fill={`url(#${uid}-plate)`} />

        {/* rim */}
        <circle
          cx={CX}
          cy={CY}
          r={R}
          fill="none"
          stroke="var(--track)"
          strokeWidth="7"
        />
        <circle
          cx={CX}
          cy={CY}
          r={R + 8}
          fill="none"
          stroke="var(--track)"
          strokeWidth="3"
          strokeDasharray="2 9"
          strokeLinecap="round"
        />

        {/* brim marker so "target" has a physical place on the jar */}
        <g opacity={0.55}>
          <line
            x1={CX + R - 20}
            y1={TOP}
            x2={CX + R + 2}
            y2={TOP}
            stroke="var(--violet-soft)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>
      </svg>

      {/* readout */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="label-cute text-[0.65rem]">
          {over ? "Over by" : "Still got"}
        </span>
        <span
          className="numeral mt-0.5 text-[2.9rem] leading-none"
          style={{ color: over ? "var(--peach)" : "var(--ink)" }}
        >
          <AnimatedNumber value={Math.abs(remaining)} />
        </span>
        <span className="mt-1 text-xs font-semibold text-[var(--ink-soft)]">
          {over ? "kcal over" : "kcal left"}
        </span>
        <span className="mt-2 rounded-full bg-[var(--inset)]/80 px-2.5 py-1 text-[0.7rem] font-semibold text-[var(--ink-soft)]">
          <span className="text-[var(--peach)]">
            <AnimatedNumber value={Math.round(calories)} />
          </span>
          {" / "}
          {target.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
