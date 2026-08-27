"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { Momo, type Mood } from "@/components/mascot/momo";
import { EASE } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * The Momo at the top of a page. Poking it makes it say something — a small
 * reward for a small curiosity, and the main reason the header feels alive
 * rather than decorated.
 */
const QUIPS = [
  "hehe that tickles",
  "oh! hi 👋",
  "boop right back",
  "i'm watching your protein 👀",
  "you're doing better than you think",
  "psst… log that snack",
  "one day at a time 🌱",
  "i believe in you, genuinely",
];

export function MomoGreeter({
  mood = "idle",
  size = 62,
  className,
}: {
  mood?: Mood;
  size?: number;
  className?: string;
}) {
  const [quip, setQuip] = useState<{ text: string; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);

  function poke() {
    counter.current += 1;
    setQuip({
      text: QUIPS[Math.floor(Math.random() * QUIPS.length)],
      id: counter.current,
    });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setQuip(null), 2400);
  }

  return (
    <div className={cn("relative shrink-0", className)}>
      <div onPointerDown={poke}>
        <Momo mood={mood} size={size} bare />
      </div>

      <AnimatePresence>
        {quip ? (
          <motion.span
            key={quip.id}
            initial={{ opacity: 0, y: 6, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.25, ease: EASE.squish }}
            className="pointer-events-none absolute -top-1 left-[85%] z-20 rounded-2xl bg-[var(--card)] px-2.5 py-1.5 text-[0.7rem] font-bold whitespace-nowrap text-[var(--ink)] shadow-[0_3px_0_0_var(--lip)]"
          >
            {quip.text}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
