"use client";

import { useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

import { diffDays, shortDayLabel, type Iso } from "@/lib/date";
import { formatWeight, formatWeightDelta, linearFit } from "@/lib/nutrition";
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
  /*
    The reading under the pointer.

    The dots carried a `<title>`, which is the browser's own tooltip: it
    only appears over a 4px circle, after a pause, in the system font, and
    never on a phone. The line is the thing people point at, so anywhere
    along it now picks the nearest reading and says what it was.
  */
  const wrap = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);

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

  // The chart is drawn in viewBox units and displayed at whatever width the
  // card gives it, so a pointer position has to come back through that scale.
  const pick = (clientX: number) => {
    const box = wrap.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const x = ((clientX - box.left) / box.width) * W;
    let nearest = 0;
    for (let i = 1; i < coords.length; i++) {
      if (Math.abs(coords[i].x - x) < Math.abs(coords[nearest].x - x)) nearest = i;
    }
    setActive(nearest);
  };

  const step = (by: number) =>
    setActive((i) => {
      const from = i ?? coords.length - 1;
      return Math.min(coords.length - 1, Math.max(0, from + by));
    });

  const shown = active === null ? null : points[active];
  const shownAt = active === null ? null : coords[active];
  const change =
    active !== null && active > 0 ? points[active].kg - points[active - 1].kg : null;

  return (
    <div
      ref={wrap}
      className={cn("relative w-full", className)}
      /* A drag across the chart is reading it, not a swipe to the next tab. */
      data-no-swipe
      onPointerMove={(e) => pick(e.clientX)}
      onPointerDown={(e) => pick(e.clientX)}
      onPointerLeave={() => setActive(null)}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-pan-y focus-visible:outline-none"
        role="img"
        /* Arrow keys walk the readings, for anyone not using a pointer. */
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") step(1);
          else if (e.key === "ArrowLeft") step(-1);
          else if (e.key === "Escape") setActive(null);
          else return;
          e.preventDefault();
        }}
        onBlur={() => setActive(null)}
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

        {shownAt ? (
          <line
            x1={shownAt.x}
            x2={shownAt.x}
            y1={PAD.top}
            y2={PAD.top + plotH}
            stroke="var(--violet)"
            strokeWidth={1.5}
            strokeDasharray="4 5"
            opacity={0.5}
          />
        ) : null}

        {coords.map((c, i) => (
          <circle
            key={points[i].iso}
            cx={c.x}
            cy={c.y}
            r={i === active ? 8 : i === coords.length - 1 ? 7 : 4}
            fill={i === active || i === coords.length - 1 ? "var(--violet)" : "var(--card)"}
            stroke="var(--violet)"
            strokeWidth={3}
          >
            {/* Kept for anything that reads the markup rather than hovers. */}
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

        {/*
          X labels. The middle one is dropped when it lands near an end:
          weigh-ins are not evenly spaced, so the middle *reading* can sit
          days from the last one and the two labels printed on top of each
          other — "Oct 21Oct 23".
        */}
        {[first, points[Math.floor(points.length / 2)], last]
          .filter((p, i, arr) => arr.findIndex((q) => q.iso === p.iso) === i)
          .filter(
            (p) =>
              p === first ||
              p === last ||
              (xOf(p.iso) - xOf(first.iso) > 90 && xOf(last.iso) - xOf(p.iso) > 90),
          )
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

      {/*
        The readout is HTML, not SVG text: real fonts, a real pill, and it
        reads the same at any chart width. `left` is a percentage of the
        viewBox so it tracks the point as the card resizes, clamped near the
        edges so the pill never hangs off the card.
      */}
      {shown && shownAt ? (
        <div
          role="status"
          data-chart-readout
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-2xl bg-[var(--inset)] px-3 py-1.5 text-center whitespace-nowrap shadow-[0_3px_0_0_var(--lip)]"
          style={{
            left: `${Math.min(88, Math.max(12, (shownAt.x / W) * 100))}%`,
            top: `${Math.max(0, (shownAt.y / H) * 100 - 3)}%`,
          }}
        >
          <p className="numeral text-sm leading-none">
            {formatWeight(shown.kg, units)}
          </p>
          <p className="label-cute mt-1 text-[0.5rem]">
            {shortDayLabel(shown.iso)}
            {change !== null && Math.abs(change) >= 0.05 ? (
              <span
                className="ml-1"
                style={{
                  color: change < 0 ? "var(--mint)" : "var(--peach)",
                }}
              >
                {formatWeightDelta(change, units)}
              </span>
            ) : null}
          </p>
        </div>
      ) : null}
    </div>
  );
}
