"use client";

import { useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";

import { NAV_ITEMS, navIndexOf } from "@/lib/nav-items";
import { useIsTouch } from "@/lib/use-media-query";

/**
 * Swipe left/right to move between tabs, in the same order as the dock.
 *
 * `dragDirectionLock` means Motion commits to one axis at the start of a
 * gesture, so a vertical scroll never turns into a page change halfway down.
 * Motion also sets `touch-action: pan-y` for a horizontal drag, which keeps
 * normal scrolling intact.
 *
 * A pill peeks in from the edge as you pull, naming the page you are about to
 * land on — otherwise the gesture is invisible until someone discovers it.
 */

/** Past this, releasing commits to the next page. */
const DISTANCE = 70;
const VELOCITY = 480;

export function SwipeNav({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isTouch = useIsTouch();
  const reduce = useReducedMotion();

  const index = navIndexOf(pathname);
  const prev = index > 0 ? NAV_ITEMS[index - 1] : null;
  const next =
    index >= 0 && index < NAV_ITEMS.length - 1 ? NAV_ITEMS[index + 1] : null;

  const x = useMotionValue(0);
  // Pulling right reveals the previous page, and vice versa.
  const prevOpacity = useTransform(x, [10, DISTANCE], [0, 1]);
  const prevScale = useTransform(x, [10, DISTANCE], [0.8, 1]);
  const nextOpacity = useTransform(x, [-DISTANCE, -10], [1, 0]);
  const nextScale = useTransform(x, [-DISTANCE, -10], [1, 0.8]);

  /** Set when a gesture starts inside something that scrolls sideways itself. */
  const blocked = useRef(false);

  const enabled = isTouch && index >= 0 && !reduce;

  return (
    <>
      <motion.div
        drag={enabled ? "x" : false}
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        dragMomentum={false}
        style={{ x }}
        onDragStart={(event) => {
          const target = event.target as HTMLElement | null;
          blocked.current = Boolean(target?.closest?.("[data-no-swipe]"));
        }}
        onDragEnd={(_event, info) => {
          if (blocked.current) {
            blocked.current = false;
            return;
          }
          const { offset, velocity } = info;
          const goNext = offset.x < -DISTANCE || velocity.x < -VELOCITY;
          const goPrev = offset.x > DISTANCE || velocity.x > VELOCITY;
          if (goNext && next) router.push(next.href);
          else if (goPrev && prev) router.push(prev.href);
        }}
      >
        {children}
      </motion.div>

      {enabled ? (
        <>
          {prev ? (
            <EdgePeek item={prev} side="left" opacity={prevOpacity} scale={prevScale} />
          ) : null}
          {next ? (
            <EdgePeek item={next} side="right" opacity={nextOpacity} scale={nextScale} />
          ) : null}
        </>
      ) : null}
    </>
  );
}

function EdgePeek({
  item,
  side,
  opacity,
  scale,
}: {
  item: (typeof NAV_ITEMS)[number];
  side: "left" | "right";
  opacity: ReturnType<typeof useTransform<number, number>>;
  scale: ReturnType<typeof useTransform<number, number>>;
}) {
  return (
    <motion.div
      aria-hidden
      style={{ opacity, scale }}
      className={`pointer-events-none fixed top-1/2 z-30 -translate-y-1/2 ${
        side === "left" ? "left-2" : "right-2"
      }`}
    >
      <span
        className="flex flex-col items-center gap-1 rounded-3xl px-3 py-2.5 text-white shadow-lg"
        style={{ background: item.color }}
      >
        <span className="text-xl leading-none">{item.emoji}</span>
        <span className="text-[0.6rem] font-bold">{item.label}</span>
      </span>
    </motion.div>
  );
}
