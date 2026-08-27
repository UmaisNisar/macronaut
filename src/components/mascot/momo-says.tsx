"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

import { Momo, type Mood } from "@/components/mascot/momo";
import { EASE, SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

type Tone = "violet" | "mint" | "peach" | "sun" | "sky";

const TINT: Record<Tone, string> = {
  sky: "tint-sky",
  violet: "tint-violet",
  mint: "tint-mint",
  peach: "tint-peach",
  sun: "tint-sun",
};

/**
 * Momo plus a speech bubble. Used anywhere the app wants to say something in
 * its own voice rather than print a label at the user.
 */
export function MomoSays({
  mood = "idle",
  tone = "violet",
  size = 92,
  title,
  children,
  footer,
  loading,
  className,
  bubbleKey,
}: {
  mood?: Mood;
  tone?: Tone;
  size?: number;
  title?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  loading?: boolean;
  className?: string;
  /** Change this to replay the bubble animation when the message changes. */
  bubbleKey?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3 sm:gap-4", className)}>
      <motion.div
        className="shrink-0"
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={SPRING.pop}
      >
        <Momo mood={loading ? "thinking" : mood} size={size} />
      </motion.div>

      <div className="min-w-0 flex-1 pt-2">
        <AnimatePresence mode="wait">
          <motion.div
            key={bubbleKey ?? String(title)}
            initial={{ opacity: 0, scale: 0.92, x: -8 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.32, ease: EASE.squish }}
            className={cn(
              "bubble bubble-left px-4 py-3.5 sm:px-5 sm:py-4",
              TINT[tone],
            )}
          >
            {loading ? (
              <div className="flex items-center gap-1.5 py-1">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="size-2.5 rounded-full bg-[var(--violet)]"
                    animate={{ y: [0, -6, 0], opacity: [0.4, 1, 0.4] }}
                    transition={{
                      duration: 0.9,
                      repeat: Infinity,
                      delay: i * 0.15,
                    }}
                  />
                ))}
              </div>
            ) : (
              <>
                {title ? (
                  <p className="font-[family-name:var(--font-display)] text-base leading-snug font-semibold text-balance sm:text-lg">
                    {title}
                  </p>
                ) : null}
                {children ? (
                  <div
                    className={cn(
                      "text-sm leading-relaxed text-pretty text-[var(--ink-soft)]",
                      title && "mt-1.5",
                    )}
                  >
                    {children}
                  </div>
                ) : null}
                {footer ? <div className="mt-3">{footer}</div> : null}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
