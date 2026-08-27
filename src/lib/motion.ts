import type { Transition, Variants } from "motion/react";

/**
 * One motion vocabulary for the whole app.
 *
 * Two easing curves do almost all the work: `squish` for anything that should
 * feel physical (buttons, stickers popping in) and `glide` for anything that
 * should feel calm (fades, reveals, meters filling). Sticking to two keeps the
 * app feeling like one object instead of a pile of components.
 */

export const EASE = {
  /** A hint of overshoot. Kept mild: at 1.56 every card visibly bounced,
   *  which read as "popping" once several landed at once on a phone. */
  squish: [0.33, 1.14, 0.68, 1] as const,
  /** Decelerating, no overshoot. */
  glide: [0.22, 1, 0.36, 1] as const,
};

export const SPRING = {
  // damping 18 put this at a ~0.52 damping ratio, i.e. properly springy.
  // 28 lands near 0.8: still alive, no visible wobble.
  pop: { type: "spring", stiffness: 420, damping: 28, mass: 0.7 },
  soft: { type: "spring", stiffness: 260, damping: 24 },
  nav: { type: "spring", stiffness: 480, damping: 34 },
} satisfies Record<string, Transition>;

/* ------------------------------------------------------------------ */
/* Entrances                                                           */
/* ------------------------------------------------------------------ */

/** Sticker landing on the page. */
export const pop: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: 8 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.3, ease: EASE.glide },
  },
  exit: { opacity: 0, scale: 0.9, transition: { duration: 0.18 } },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE.glide } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
};

export const slideIn: Variants = {
  hidden: { opacity: 0, x: -18 },
  show: { opacity: 1, x: 0, transition: { duration: 0.4, ease: EASE.glide } },
};

/** Parent wrapper: children arrive one after another. */
export const stagger = (gap = 0.07, delay = 0): Variants => ({
  hidden: {},
  show: {
    transition: { staggerChildren: gap, delayChildren: delay },
  },
});

/* ------------------------------------------------------------------ */
/* Reactions                                                           */
/* ------------------------------------------------------------------ */

/** Press feedback for anything tappable. */
export const squish = {
  whileHover: { scale: 1.02, y: -1 },
  whileTap: { scale: 0.97, y: 1 },
  transition: SPRING.pop,
};

/** Food stickers and list rows: lift and tilt a touch on hover. */
export const liftTilt = (tilt = 1.2) => ({
  whileHover: { y: -2, rotate: tilt * 0.6, scale: 1.01 },
  whileTap: { scale: 0.99 },
  transition: SPRING.pop,
});

export const celebrate: Variants = {
  hidden: { scale: 0, rotate: -25, opacity: 0 },
  show: {
    scale: [0.5, 1.06, 1],
    rotate: [-12, 4, 0],
    opacity: 1,
    transition: { duration: 0.65, ease: EASE.squish, times: [0, 0.6, 1] },
  },
};

export const wiggle = {
  rotate: [0, -6, 5, -3, 0],
  transition: { duration: 0.55, ease: "easeInOut" as const },
};

/* ------------------------------------------------------------------ */
/* Page transitions                                                    */
/* ------------------------------------------------------------------ */

export const pageTransition: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.995 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.34, ease: EASE.glide },
  },
  exit: { opacity: 0, y: -6, transition: { duration: 0.16 } },
};

/** Reveal-on-scroll defaults, shared so every section behaves alike. */
export const inView = {
  initial: "hidden" as const,
  whileInView: "show" as const,
  viewport: { once: true, margin: "-60px" },
};
