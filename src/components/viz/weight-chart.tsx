"use client";

import { useId } from "react";
import { motion, useReducedMotion } from "motion/react";

import { diffDays, shortDayLabel, type Iso } from "@/lib/date";
import { formatWeight, linearFit } from "@/lib/nutrition";
import { smoothPath, type Point } from "@/lib/geometry";
import type { UnitSystem } from "@/lib/schemas";
import { cn } from "@/lib/utils";

export type WeightPoint = { iso: Iso; kg: number };

const W = 720;
const H = 260;
const PAD = { top: 24, right: 18, bottom: 34, left: 46 };

export function WeightChart({
  points,
  targetKg,
  units,
  className,
}: {
  points: WeightPoint[];
  targetKg: number;
  units: UnitSystem;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const reduce = useReducedMotion();

  if (points.length === 0) {
    return (
      <div
        className={cn(
          "flex h-52 items-center justify-center rounded-3xl border-2 border-dashed border-[var(--track)] text-sm text-[var(--ink-soft)]",
          className,
        )}
      >
        Log a weight and the trend line starts here.
      </div>
    );
  }

  const first = points[0];
  const last = points[points.length - 1];
  const span = Math.max(1, diffDays(first.iso, last.iso));

  const values = points.map((p) => p.kg);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const spread = dataMax - dataMin;
  const pad = Math.max(0.6, spread * 0.25);

  // A target 15 kg below the current range would squash the actual trend into a
  // flat line at the top of the chart. When it is that far out we keep the
  // domain on the data and call the target out as off-scale instead.
  const targetInView = targetKg >= dataMin - Math.max(2.5, spread * 2);
  const yMin = targetInView ? Math.min(dataMin, targetKg) - pad : dataMin - pad;
  const yMax = dataMax + pad;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const xOf = (iso: Iso) =>
    PAD.left + (diffDays(first.iso, iso) / span) * plotW;
  const yOf = (kg: number) =>
    PAD.top + (1 - (kg - yMin) / (yMax - yMin)) * plotH;

  const coords: Point[] = points.map((p) => ({ x: xOf(p.iso), y: yOf(p.kg) }));
  const line = smoothPath(coords);
  const area = `${line} L ${coords[coords.length - 1].x} ${PAD.top + plotH} L ${coords[0].x} ${PAD.top + plotH} Z`;

  const fit =
    points.length >= 3
      ? linearFit(
          points.map((p) => ({ x: diffDays(first.iso, p.iso), y: p.kg })),
        )
      : null;

  const targetY = yOf(targetKg);
  const gridValues = [yMax, (yMax + yMin) / 2, yMin];

  return (
    <div className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Weight from ${formatWeight(first.kg, units)} to ${formatWeight(last.kg, units)} across ${span} days, against a ${formatWeight(targetKg, units)} target.`}
      >
        <defs>
          <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--violet)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--violet)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid */}
        {gridValues.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={yOf(v)}
              y2={yOf(v)}
              stroke="var(--track)"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 10}
              y={yOf(v) + 4}
              textAnchor="end"
              style={{
                fill: "var(--ink-soft)",
                fontFamily: "var(--font-display)",
              }}
              className="text-[10px]"
            >
              {v.toFixed(1)}
            </text>
          </g>
        ))}

        {/* Target */}
        {targetInView && targetY > PAD.top && targetY < H - PAD.bottom && (
          <g>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={targetY}
              y2={targetY}
              stroke="var(--mint)"
              strokeWidth={1.6}
              strokeDasharray="7 6"
              opacity={0.85}
            />
            <text
              x={W - PAD.right}
              y={targetY - 8}
              textAnchor="end"
              style={{ fill: "var(--mint)", fontFamily: "var(--font-display)" }}
              className="text-[10px] tracking-[0.14em]"
            >
              TARGET {formatWeight(targetKg, units)}
            </text>
          </g>
        )}

        {/* Trend line */}
        {fit && (
          <line
            x1={xOf(first.iso)}
            y1={yOf(fit.intercept)}
            x2={xOf(last.iso)}
            y2={yOf(fit.intercept + fit.slope * span)}
            stroke="var(--violet)"
            strokeWidth={1.6}
            strokeDasharray="3 5"
            opacity={0.75}
          />
        )}

        <path d={area} fill={`url(#${uid}-fill)`} />

        <motion.path
          d={line}
          fill="none"
          stroke="var(--violet)"
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        />

        {coords.map((c, i) => (
          <circle
            key={points[i].iso}
            cx={c.x}
            cy={c.y}
            r={i === coords.length - 1 ? 7 : 4}
            fill={i === coords.length - 1 ? "var(--violet)" : "var(--card)"}
            stroke="var(--violet)"
            strokeWidth={3}
          >
            <title>{`${shortDayLabel(points[i].iso)} — ${formatWeight(points[i].kg, units)}`}</title>
          </circle>
        ))}

        {/* Target below the visible range */}
        {!targetInView && (
          <text
            x={W - PAD.right}
            y={H - PAD.bottom - 6}
            textAnchor="end"
            style={{ fill: "var(--mint)", fontFamily: "var(--font-display)" }}
            className="text-[10px] tracking-[0.14em]"
          >
            ↓ TARGET {formatWeight(targetKg, units)} — BELOW THIS VIEW
          </text>
        )}

        {/* X labels */}
        {[first, points[Math.floor(points.length / 2)], last]
          .filter((p, i, arr) => arr.findIndex((q) => q.iso === p.iso) === i)
          .map((p, i, arr) => (
            <text
              key={p.iso}
              x={xOf(p.iso)}
              y={H - 10}
              textAnchor={i === 0 ? "start" : i === arr.length - 1 ? "end" : "middle"}
              style={{
                fill: "var(--ink-soft)",
                fontFamily: "var(--font-display)",
              }}
              className="text-[10px]"
            >
              {shortDayLabel(p.iso)}
            </text>
          ))}
      </svg>
    </div>
  );
}
