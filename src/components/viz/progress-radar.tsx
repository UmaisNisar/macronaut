"use client";

import { motion, useReducedMotion } from "motion/react";

import { polar, regularPolygon, toPolyPoints } from "@/lib/geometry";
import { clamp } from "@/lib/nutrition";
import { cn } from "@/lib/utils";

export type RadarAxis = {
  label: string;
  /** 0–1 */
  current: number;
  /** 0–1, drawn as a ghost outline for comparison */
  previous?: number;
};

const SIZE = 300;
const C = SIZE / 2;
const R = 96;

/**
 * Five dimensions of "how the fortnight went", with the previous fortnight as a
 * ghost behind it. The shape change is the message — you can see whether the
 * whole profile grew, not just one metric.
 */
export function ProgressRadar({
  axes,
  className,
}: {
  axes: RadarAxis[];
  className?: string;
}) {
  const reduce = useReducedMotion();
  const n = axes.length;

  const point = (index: number, value: number) =>
    polar(C, C, R * clamp(value, 0.04, 1.08), (360 / n) * index);

  const currentPoly = toPolyPoints(axes.map((a, i) => point(i, a.current)));
  const hasPrevious = axes.some((a) => typeof a.previous === "number");
  const previousPoly = hasPrevious
    ? toPolyPoints(axes.map((a, i) => point(i, a.previous ?? 0)))
    : null;

  return (
    <div className={cn("relative mx-auto w-full max-w-[300px]", className)}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full overflow-visible">
        {/* Web */}
        {[0.25, 0.5, 0.75, 1].map((ring) => (
          <polygon
            key={ring}
            points={toPolyPoints(regularPolygon(C, C, R * ring, n))}
            fill="none"
            stroke="var(--track)"
            strokeWidth={1}
          />
        ))}
        {axes.map((_, i) => {
          const p = polar(C, C, R, (360 / n) * i);
          return (
            <line
              key={i}
              x1={C}
              y1={C}
              x2={p.x}
              y2={p.y}
              stroke="var(--track)"
              strokeWidth={1}
            />
          );
        })}

        {previousPoly && (
          <polygon
            points={previousPoly}
            fill="var(--muted)"
            stroke="var(--ink-soft)"
            strokeWidth={1.4}
            strokeDasharray="4 4"
          />
        )}

        <motion.polygon
          points={currentPoly}
          fill="color-mix(in oklab, var(--violet) 22%, transparent)"
          stroke="var(--violet)"
          strokeWidth={3.5}
          strokeLinejoin="round"
          initial={reduce ? false : { scale: 0.2, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformOrigin: `${C}px ${C}px` }}
        />

        {axes.map((a, i) => {
          const p = point(i, a.current);
          return (
            <circle key={a.label} cx={p.x} cy={p.y} r={3.4} fill="var(--violet)" />
          );
        })}

        {axes.map((a, i) => {
          const p = polar(C, C, R + 26, (360 / n) * i);
          const anchor =
            Math.abs(p.x - C) < 12 ? "middle" : p.x > C ? "start" : "end";
          return (
            <text
              key={a.label}
              x={p.x}
              y={p.y + 3}
              textAnchor={anchor}
              style={{
                fill: "var(--ink-soft)",
                fontFamily: "var(--font-display)",
              }}
              className="text-[10px] font-bold tracking-[0.08em] uppercase"
            >
              {a.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
