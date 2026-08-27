"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { navIndexOf } from "@/lib/nav-items";
import { EASE } from "@/lib/motion";

/**
 * Cross-fades between pages, and slides in the direction you actually moved —
 * swiping left brings the next page in from the right, matching the dock order.
 * Tapping a tab gets the same treatment, so the app has one spatial model.
 */
export function PageShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  const index = navIndexOf(pathname);

  // Which way we travelled, derived by comparing against the previous tab.
  // Adjusting state during render (rather than poking a ref) is the supported
  // way to do this and stays correct under concurrent rendering.
  const [seen, setSeen] = useState({ index, direction: 0 });
  if (seen.index !== index) {
    setSeen({
      index,
      direction:
        index >= 0 && seen.index >= 0 ? (index > seen.index ? 1 : -1) : 0,
    });
  }
  const direction = seen.index === index ? seen.direction : 0;

  const shift = reduce ? 0 : 26;

  return (
    <AnimatePresence mode="wait" initial={false} custom={direction}>
      <motion.div
        key={pathname}
        custom={direction}
        initial={{ opacity: 0, x: direction * shift }}
        animate={{ opacity: 1, x: 0 }}
        // `mode="wait"` will not mount the next page until this exit has
        // finished, so the exit duration is pure added latency on every single
        // tab change. Keep it short enough to read as a wipe rather than a wait.
        exit={{
          opacity: 0,
          x: direction * -shift * 0.6,
          transition: { duration: reduce ? 0.05 : 0.09, ease: "easeIn" },
        }}
        transition={{ duration: reduce ? 0.1 : 0.18, ease: EASE.glide }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
