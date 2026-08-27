"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { NAV_ITEMS, navIndexOf } from "@/lib/nav-items";
import { useIsTouch } from "@/lib/use-media-query";

/**
 * Swipe left and right to move between tabs, in the order of the dock.
 *
 * Implemented with passive touch listeners rather than a draggable wrapper.
 * The wrapper approach put a gesture handler around the entire page, and that
 * handler claimed horizontal movement everywhere — including inside the
 * horizontally scrolling "Log again" strip, which could not be scrolled at all
 * because the page was consuming the gesture. Marking the strip `data-no-swipe`
 * stopped it navigating but not the drag itself, so scrolling stayed broken.
 *
 * Listening passively fixes that by construction: nothing is intercepted,
 * nothing calls preventDefault, and the browser handles every scroll natively.
 * A tab change is decided after the fact, from where the finger started and
 * finished.
 *
 * The cost is the peek pill that used to follow your thumb. Reliable scrolling
 * is worth more than that.
 */

/** Horizontal travel needed before a swipe counts. */
const DISTANCE = 70;
/** How much more horizontal than vertical it must be, so scrolls never count. */
const DIRECTION_RATIO = 1.8;
/** Longer than this is a drag or a pause, not a flick. */
const MAX_DURATION = 700;

export function SwipeNav({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isTouch = useIsTouch();

  const host = useRef<HTMLDivElement | null>(null);
  const start = useRef<{ x: number; y: number; at: number; ok: boolean } | null>(
    null,
  );

  // The listeners are attached once and stay passive, so they read the current
  // route through a ref rather than being torn down on every navigation.
  const target = useRef({ pathname, router });
  useEffect(() => {
    target.current = { pathname, router };
  }, [pathname, router]);

  useEffect(() => {
    const node = host.current;
    if (!node || !isTouch) return;

    /**
     * A gesture that begins inside something which scrolls sideways itself
     * belongs to that thing, not to navigation.
     */
    const startsInsideScroller = (el: Element | null): boolean => {
      for (let n = el; n && n !== node; n = n.parentElement) {
        if (n instanceof HTMLElement) {
          if (n.dataset.noSwipe !== undefined) return true;
          const overflow = getComputedStyle(n).overflowX;
          if (
            (overflow === "auto" || overflow === "scroll") &&
            n.scrollWidth > n.clientWidth + 1
          ) {
            return true;
          }
        }
      }
      return false;
    };

    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        start.current = null;
        return;
      }
      const t = event.touches[0];
      start.current = {
        x: t.clientX,
        y: t.clientY,
        at: Date.now(),
        ok: !startsInsideScroller(event.target as Element | null),
      };
    };

    const onEnd = (event: TouchEvent) => {
      const s = start.current;
      start.current = null;
      if (!s || !s.ok) return;

      const t = event.changedTouches[0];
      if (!t) return;

      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (Date.now() - s.at > MAX_DURATION) return;
      if (Math.abs(dx) < DISTANCE) return;
      if (Math.abs(dx) < Math.abs(dy) * DIRECTION_RATIO) return;

      const index = navIndexOf(target.current.pathname);
      if (index < 0) return;
      const next = dx < 0 ? NAV_ITEMS[index + 1] : NAV_ITEMS[index - 1];
      if (next) target.current.router.push(next.href);
    };

    // Passive: this only ever observes. It must never be able to block a scroll.
    node.addEventListener("touchstart", onStart, { passive: true });
    node.addEventListener("touchend", onEnd, { passive: true });
    node.addEventListener("touchcancel", () => (start.current = null), {
      passive: true,
    });
    return () => {
      node.removeEventListener("touchstart", onStart);
      node.removeEventListener("touchend", onEnd);
    };
  }, [isTouch]);

  return <div ref={host}>{children}</div>;
}
