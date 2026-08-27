"use client";

import { motion, useReducedMotion } from "motion/react";

import { clamp } from "@/lib/nutrition";
import { AnimatedNumber } from "@/components/viz/animated-number";
import { EASE, SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type MacroKind = "protein" | "carbs" | "fat" | "fiber" | "sugar";

export const MACRO_STYLE: Record<
  MacroKind,
  { name: string; emoji: string; color: string; soft: string }
> = {
  protein: {
    name: "Protein",
    emoji: "💪",
    color: "var(--mint)",
    soft: "var(--mint-soft)",
  },
  carbs: {
    name: "Carbs",
    emoji: "⚡",
    color: "var(--sky)",
    soft: "var(--sky-soft)",
  },
  fat: {
    name: "Fat",
    emoji: "🥑",
    color: "var(--sun)",
    soft: "var(--sun-soft)",
  },
  fiber: {
    name: "Fiber",
    emoji: "🌱",
    color: "var(--leaf)",
    soft: "var(--leaf-soft)",
  },
  sugar: {
    name: "Sugar",
    emoji: "🍬",
    color: "var(--berry)",
    soft: "var(--berry-soft)",
  },
};

export type MacroRow = { kind: MacroKind; value: number; target: number };

export function MacroMeters({
  rows,
  className,
  compact,
}: {
  rows: MacroRow[];
  className?: string;
  compact?: boolean;
}) {
  const reduce = useReducedMotion();

  return (
    <div className={cn(compact ? "space-y-2.5" : "space-y-4", className)}>
      {rows.map((row, index) => {
        const style = MACRO_STYLE[row.kind];
        const pct = clamp(row.value / Math.max(1, row.target), 0, 1);
        const over = row.value > row.target * 1.15;
        // A star means "nailed it", so overshooting does not earn one.
        const hit = row.value >= row.target * 0.95 && !over;

        return (
          <div key={row.kind} className="flex items-center gap-3">
            {/* emoji token */}
            <motion.div
              className="relative grid size-10 shrink-0 place-items-center rounded-2xl text-lg"
              style={{ background: style.soft }}
              animate={
                hit && !reduce
                  ? { rotate: [0, -8, 8, 0], scale: [1, 1.08, 1] }
                  : { rotate: 0, scale: 1 }
              }
              transition={{ duration: 0.6, delay: 0.6 + index * 0.1 }}
            >
              <span aria-hidden>{style.emoji}</span>
              {hit ? (
                <motion.span
                  className="absolute -top-1.5 -right-1.5 text-xs"
                  initial={{ scale: 0, rotate: -40 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ ...SPRING.pop, delay: 0.8 + index * 0.1 }}
                  aria-hidden
                >
                  ⭐
                </motion.span>
              ) : null}
            </motion.div>

            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-semibold">
                  {style.name}
                </span>
                <span className="numeral shrink-0 text-sm">
                  <span style={{ color: style.color }}>
                    <AnimatedNumber
                      value={row.value}
                      decimals={row.value > 0 && row.value < 10 ? 1 : 0}
                    />
                  </span>
                  <span className="text-[var(--ink-soft)]">
                    {" / "}
                    {Math.round(row.target)}g
                  </span>
                </span>
              </div>

              {/* tank */}
              <div
                className="relative h-3.5 overflow-hidden rounded-full"
                style={{ background: style.soft }}
              >
                <motion.div
                  className="relative h-full rounded-full"
                  style={{
                    background: over
                      ? `linear-gradient(90deg, ${style.color}, var(--peach))`
                      : `linear-gradient(90deg, color-mix(in oklab, ${style.color} 62%, var(--card)), ${style.color})`,
                  }}
                  initial={reduce ? false : { width: 0 }}
                  animate={{ width: `${Math.max(pct * 100, row.value > 0 ? 7 : 0)}%` }}
                  transition={{
                    duration: 0.9,
                    delay: reduce ? 0 : 0.15 + index * 0.09,
                    ease: EASE.glide,
                  }}
                >
                  {/* gloss */}
                  <span className="absolute inset-x-1 top-[3px] h-[3px] rounded-full bg-white/35" />
                </motion.div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
