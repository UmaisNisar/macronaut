"use client";

import { useId, useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";

import type { Journey } from "@/lib/nutrition";
import { formatWeight } from "@/lib/nutrition";
import type { UnitSystem } from "@/lib/schemas";
import { Momo } from "@/components/mascot/momo";
import { AnimatedNumber } from "@/components/viz/animated-number";
import { EASE, SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * The journey drawn as a road, with Momo standing exactly where you are on it.
 * Travelled road is solid and pink; the rest is a dotted trail waiting for you.
 */

const W = 720;
const H = 230;
const P0 = { x: 62, y: 168 };
const P1 = { x: 250, y: 196 };
const P2 = { x: 470, y: 74 };
const P3 = { x: 656, y: 104 };

function cubic(t: number) {
  const u = 1 - t;
  return {
    x:
      u * u * u * P0.x + 3 * u * u * t * P1.x + 3 * u * t * t * P2.x + t * t * t * P3.x,
    y:
      u * u * u * P0.y + 3 * u * u * t * P1.y + 3 * u * t * t * P2.y + t * t * t * P3.y,
  };
}

const PATH = `M ${P0.x} ${P0.y} C ${P1.x} ${P1.y}, ${P2.x} ${P2.y}, ${P3.x} ${P3.y}`;

/** Arc-length lookup so "40% there" lands 40% along the drawn road. */
function useRoad() {
  return useMemo(() => {
    const STEPS = 240;
    const pts = Array.from({ length: STEPS + 1 }, (_, i) => cubic(i / STEPS));
    const cum = [0];
    for (let i = 1; i <= STEPS; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      // sqrt is exactly specified by IEEE 754; Math.hypot is not, and this
      // value picks an index that must match between server and client.
      cum.push(cum[i - 1] + Math.sqrt(dx * dx + dy * dy));
    }
    const total = cum[STEPS];
    return {
      at(fraction: number) {
        const want = Math.max(0, Math.min(1, fraction)) * total;
        let i = cum.findIndex((v) => v >= want);
        if (i < 0) i = STEPS;
        return pts[i];
      },
    };
  }, []);
}

export function JourneyPath({
  journey,
  units,
  className,
}: {
  journey: Journey;
  units: UnitSystem;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const reduce = useReducedMotion();
  const road = useRoad();

  const pct = journey.percent;
  const me = road.at(pct);
  const percentLabel = Math.round(pct * 100);

  return (
    <div className={cn("w-full", className)}>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full overflow-visible"
          role="img"
          aria-label={`${percentLabel}% of the way from ${journey.startKg} to ${journey.targetKg} kilograms.`}
        >
          <defs>
            <linearGradient id={`${uid}-road`} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--violet)" />
              <stop offset="60%" stopColor="var(--sky)" />
              <stop offset="100%" stopColor="var(--mint)" />
            </linearGradient>
          </defs>

          {/* road still to walk */}
          <path
            d={PATH}
            fill="none"
            stroke="var(--track)"
            strokeWidth="14"
            strokeLinecap="round"
          />
          <path
            d={PATH}
            fill="none"
            stroke="var(--card)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="1 18"
            opacity="0.9"
          />

          {/* road already walked */}
          <motion.path
            d={PATH}
            fill="none"
            stroke={`url(#${uid}-road)`}
            strokeWidth="14"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1 1"
            initial={reduce ? false : { strokeDashoffset: 1 }}
            whileInView={{ strokeDashoffset: 1 - pct }}
            viewport={{ once: true }}
            transition={{ duration: 1.5, ease: EASE.glide }}
          />

          {/* milestones */}
          {[0.25, 0.5, 0.75].map((m, i) => {
            const p = road.at(m);
            const done = pct >= m;
            return (
              <g key={m}>
                <motion.circle
                  cx={p.x}
                  cy={p.y}
                  r={done ? 13 : 10}
                  fill={done ? "var(--sun)" : "var(--inset)"}
                  stroke={done ? "var(--sun)" : "var(--track)"}
                  strokeWidth="3"
                  initial={reduce ? false : { scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ ...SPRING.pop, delay: 0.5 + i * 0.15 }}
                  style={{ transformOrigin: `${p.x}px ${p.y}px` }}
                />
                {done ? (
                  <text
                    x={p.x}
                    y={p.y + 5}
                    textAnchor="middle"
                    fontSize="13"
                  >
                    ⭐
                  </text>
                ) : null}
                <text
                  x={p.x}
                  y={p.y + 32}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="700"
                  fill={done ? "var(--sun)" : "var(--ink-soft)"}
                >
                  {m * 100}%
                </text>
              </g>
            );
          })}

          {/* start — dimmed while Momo is still standing on it */}
          <g opacity={pct < 0.06 ? 0.4 : 1}>
            <circle
              cx={P0.x}
              cy={P0.y}
              r="16"
              fill="var(--inset)"
              stroke="var(--track)"
              strokeWidth="4"
            />
            <text x={P0.x} y={P0.y + 6} textAnchor="middle" fontSize="16">
              🏠
            </text>
          </g>

          {/* goal */}
          <motion.g
            animate={{ y: reduce ? 0 : [0, -5, 0] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          >
            <circle cx={P3.x} cy={P3.y} r="20" fill="var(--inset)" stroke="var(--mint-soft)" strokeWidth="4" />
            <text x={P3.x} y={P3.y + 8} textAnchor="middle" fontSize="21">
              🎯
            </text>
          </motion.g>
        </svg>

        {/* labels + Momo live in HTML so they get real fonts and real animation */}
        <div
          className="absolute -translate-x-1/2 text-center"
          style={{ left: `${(P0.x / W) * 100}%`, top: `${(P0.y / H) * 100 + 12}%` }}
        >
          <p className="label-cute text-[0.55rem]">Start</p>
          <p className="numeral text-sm whitespace-nowrap">
            {formatWeight(journey.startKg, units)}
          </p>
        </div>

        <div
          className="absolute -translate-x-1/2 text-center"
          style={{ left: `${(P3.x / W) * 100}%`, top: `${(P3.y / H) * 100 + 14}%` }}
        >
          <p className="label-cute text-[0.55rem]">Goal</p>
          <p className="numeral text-sm whitespace-nowrap text-[var(--mint)]">
            {formatWeight(journey.targetKg, units)}
          </p>
        </div>

        {/* you are here */}
        <motion.div
          className="absolute"
          style={{ left: `${(me.x / W) * 100}%`, top: `${(me.y / H) * 100}%` }}
          initial={reduce ? false : { opacity: 0, scale: 0.5 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ ...SPRING.pop, delay: 0.9 }}
        >
          {/*
            Momo stands *above* the road on a little pin rather than on it.
            Sitting on the point put it straight through the start marker at 0%,
            and its ground shadow read as a smudge on the tarmac.
          */}
          <div className="relative flex -translate-x-1/2 -translate-y-full flex-col items-center pb-1">
            <div className="rounded-full bg-[var(--inset)] px-2.5 py-1 text-xs font-bold whitespace-nowrap shadow-[0_3px_0_0_var(--lip)]">
              {formatWeight(journey.currentKg, units)}
            </div>
            <Momo
              mood={journey.reachedGoal ? "celebrating" : "proud"}
              size={62}
              bare
              shadow={false}
              className="-my-1"
            />
            <span
              aria-hidden
              className="size-2.5 rotate-45 rounded-[2px] bg-[var(--violet)]"
            />
          </div>
        </motion.div>
      </div>

      <div className="mt-3 flex items-end justify-center gap-2">
        <span className="numeral text-4xl leading-none text-[var(--violet)]">
          <AnimatedNumber value={percentLabel} />%
        </span>
        <span className="pb-1 text-sm font-semibold text-[var(--ink-soft)]">
          of the way there
        </span>
      </div>
    </div>
  );
}
