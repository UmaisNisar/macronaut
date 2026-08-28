"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";

import { STATUS_META } from "@/lib/nutrition";
import type { DayStatus } from "@/lib/schemas";
import { inView, liftTilt, pop } from "@/lib/motion";
import { useIsTouch } from "@/lib/use-media-query";
import { Momo, type Mood } from "@/components/mascot/momo";
import { cn } from "@/lib/utils";

export type Tint =
  | "plain"
  | "violet"
  | "peach"
  | "mint"
  | "sky"
  | "sun"
  | "berry";

const TINT_CLASS: Record<Tint, string> = {
  plain: "",
  peach: "tint-peach",
  violet: "tint-violet",
  mint: "tint-mint",
  sky: "tint-sky",
  sun: "tint-sun",
  berry: "tint-berry",
};

/**
 * The sticker: the only surface in the app. Everything is a cut-out sitting on
 * the candy background, never a flat panel in a grid of flat panels.
 */
export function Sticker({
  children,
  tint = "plain",
  className,
  tilt,
  animate = true,
  inset = true,
}: {
  children: ReactNode;
  tint?: Tint;
  className?: string;
  /** Degrees of resting rotation — a couple of these keep the page hand-made. */
  tilt?: number;
  animate?: boolean;
  inset?: boolean;
}) {
  // whileHover is JS-driven, so on a touchscreen it latches after a tap.
  const isTouch = useIsTouch();
  const style = tilt ? { rotate: `${tilt}deg` } : undefined;

  if (!animate) {
    return (
      <section
        style={style}
        className={cn(
          "sticker",
          TINT_CLASS[tint],
          inset && "p-5 sm:p-6",
          className,
        )}
      >
        {children}
      </section>
    );
  }

  return (
    <motion.section
      variants={pop}
      {...inView}
      whileHover={isTouch ? undefined : { y: -3 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      style={style}
      className={cn(
        "sticker",
        TINT_CLASS[tint],
        inset && "p-5 sm:p-6",
        className,
      )}
    >
      {children}
    </motion.section>
  );
}

export function StickerHeading({
  emoji,
  title,
  hint,
  action,
  className,
}: {
  emoji?: string;
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn("mb-4 flex items-start justify-between gap-3", className)}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        {emoji ? (
          <span className="mt-0.5 text-xl leading-none" aria-hidden>
            {emoji}
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-lg leading-tight font-bold sm:text-xl">{title}</h2>
          {hint ? (
            <p className="mt-1 text-sm text-[var(--ink-soft)]">{hint}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

/** Small rounded readout — a "fridge magnet" of one number. */
export function Magnet({
  label,
  value,
  hint,
  color,
  emoji,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  color?: string;
  emoji?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("rounded-2xl px-3.5 py-3", className)}
      style={{
        background: color
          ? `color-mix(in oklab, ${color} 14%, var(--card))`
          : "var(--muted)",
      }}
    >
      <p className="label-cute flex items-center gap-1">
        {emoji ? <span aria-hidden>{emoji}</span> : null}
        {label}
      </p>
      <p
        className="numeral mt-1 text-xl leading-none"
        style={color ? { color } : undefined}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-[var(--ink-soft)]">{hint}</p>
      ) : null}
    </div>
  );
}

export function StatusBadge({
  status,
  className,
  size = "md",
}: {
  status: DayStatus;
  className?: string;
  size?: "sm" | "md";
}) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-semibold",
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm",
        className,
      )}
      style={{
        background: `color-mix(in oklab, ${meta.token} 18%, var(--card))`,
        color: `color-mix(in oklab, ${meta.token} 78%, var(--ink))`,
      }}
    >
      <span aria-hidden>{meta.emoji}</span>
      {meta.label}
    </span>
  );
}

/** Empty state with Momo doing the talking. */
export function EmptyNest({
  mood = "curious",
  title,
  children,
  action,
  className,
}: {
  mood?: Mood;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-8 text-center",
        className,
      )}
    >
      <Momo mood={mood} size={92} />
      <p className="mt-3 font-[family-name:var(--font-display)] text-base font-semibold">
        {title}
      </p>
      {children ? (
        <p className="mt-1.5 max-w-xs text-sm text-pretty text-[var(--ink-soft)]">
          {children}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Hand-drawn-ish divider. */
export function Squiggle({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 240 8"
      preserveAspectRatio="none"
      className={cn("my-5 h-2 w-full text-[var(--track)]", className)}
    >
      <path
        d="M0 4 Q 10 0 20 4 T 40 4 T 60 4 T 80 4 T 100 4 T 120 4 T 140 4 T 160 4 T 180 4 T 200 4 T 220 4 T 240 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Row that lifts and tilts on hover — used for food and log entries. */
export function LiftRow({
  children,
  className,
  tilt = 0.8,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  tilt?: number;
} & React.ComponentProps<typeof motion.div>) {
  return (
    <motion.div {...liftTilt(tilt)} className={className} {...rest}>
      {children}
    </motion.div>
  );
}
