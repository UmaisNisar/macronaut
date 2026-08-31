"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";

import { NAV_ITEMS } from "@/lib/nav-items";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { cn } from "@/lib/utils";

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Tapping the tab you are already on sends you back to the top.
 *
 * The convention every phone user already has, and Today is five screens
 * tall, so the alternative is a long thumb drag back to the composer.
 * Without this the tap is worse than nothing: Next treats it as a navigation
 * to the current route and re-renders in place, which looks like a flicker
 * and leaves you exactly where you were.
 *
 * Smooth here and nowhere else. `scroll-behavior: smooth` was deliberately
 * left off globally in globals.css because it also applies to scroll
 * restoration and to every router.refresh() the app makes, which had the
 * page drifting on its own. This is one deliberate scroll, so it opts in --
 * unless the reader has asked for less motion, in which case it jumps.
 */
function useScrollTopOnActive(active: boolean) {
  return (event: React.MouseEvent) => {
    if (!active) return;
    event.preventDefault();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };
}


/**
 * The moving pill, measured rather than projected.
 *
 * It used to be `{active && <motion.span layoutId="rail-blob" />}` -- one
 * element unmounting under the old tab while another mounts under the new,
 * with Motion animating between the two. That works until the animation is
 * interrupted, and a route change interrupts it: sampling every frame across
 * the same Today hop, twice it slid (largest step 43px and 51px) and once it
 * covered 175px in a single frame, a third of the dock, mid-flight. Which is
 * exactly the "sometimes it jumps, sometimes it travels" that was reported.
 *
 * A shared-layout animation re-measures when the tree around it changes, and
 * the tree around it is the page. So the pill is now a single element that
 * never unmounts, moved by transform to the box of whichever tab is active.
 * A transform tween has nothing to re-measure and cannot be re-projected.
 *
 * Measured, not computed from the index: the rail has a gap between items and
 * the dock does not, and hard-coding either invites the pill to drift the day
 * someone changes the spacing.
 */
function usePill(activeIndex: number) {
  const listRef = useRef<HTMLUListElement>(null);
  /*
   * Move on the tap, not on the route.
   *
   * The pill used to wait for usePathname() to change, which does not happen
   * until React has processed the navigation -- and processing the navigation
   * is the expensive part. Timing the frames showed the cost exactly: on the
   * first hop to Today the main thread goes quiet for 64ms with no frames at
   * all, and the pill had barely left its old tab when that began. It came
   * back most of the way across.
   *
   * Setting the target on click starts the transform before the heavy render
   * begins, so the compositor is already carrying it when the main thread
   * stalls. Cleared whenever the real route catches up, or changes to
   * somewhere else entirely, so a cancelled navigation cannot strand it.
   */
  const [aim, setAim] = useState<{ seen: number; target: number | null }>({
    seen: activeIndex,
    target: null,
  });
  // Adjusted during render rather than in an effect, matching PageShell: it is
  // the supported way to react to a changed prop and stays correct under
  // concurrent rendering, where an effect would cascade an extra render.
  if (aim.seen !== activeIndex) setAim({ seen: activeIndex, target: null });
  const index = (aim.seen === activeIndex ? aim.target : null) ?? activeIndex;
  const aimAt = (next: number) =>
    setAim((prev) => ({ ...prev, target: next }));
  const [box, setBox] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const measure = () => {
      // Query the items, not children[]: the pill is itself the list's first
      // child, so indexing children put it one tab to the left of the tab it
      // was meant to sit under.
      const item = list.querySelectorAll("li")[index] as
        | HTMLElement
        | undefined;
      if (!item) {
        setBox(null);
        return;
      }
      setBox({
        x: item.offsetLeft,
        y: item.offsetTop,
        w: item.offsetWidth,
        h: item.offsetHeight,
      });
    };

    measure();
    // Fonts landing or the dock reflowing moves the tabs under the pill.
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [index]);

  return { listRef, box, index, aimAt };
}

/**
 * The pill itself: a CSS transition, not a JS one.
 *
 * Measuring instead of projecting fixed most of the jump but not all of it --
 * one hop in ten still moved 110px in a single frame, and the frames before it
 * had barely moved at all. That shape is the giveaway. Motion drives springs
 * from the clock on the main thread, and the main thread is busy rendering the
 * page you just navigated to; Today is the most expensive screen in the app.
 * No frames run, then one does, and the spring jumps to wherever the elapsed
 * time says it should be.
 *
 * A transform transition runs on the compositor, which keeps going while the
 * main thread is blocked -- the same reason the meters and the jar were moved
 * off Motion. Only the transform is animated: every tab is the same size, so
 * the pill never needs to resize mid-flight, and width and height would drag
 * it back onto the main thread if it did.
 *
 * Reduced motion is handled globally in globals.css, which forces every
 * transition-duration to near zero with !important.
 */
function Pill({
  box,
  color,
  radius,
}: {
  box: { x: number; y: number; w: number; h: number } | null;
  color: string;
  radius: string;
}) {
  if (!box) return null;
  return (
    <span
      aria-hidden
      className={cn("pointer-events-none absolute top-0 left-0", radius)}
      style={{
        width: box.w,
        height: box.h,
        backgroundColor: color,
        transform: `translate3d(${box.x}px, ${box.y}px, 0)`,
        transition:
          "transform 260ms cubic-bezier(0.33, 1, 0.68, 1), background-color 260ms ease",
        willChange: "transform",
      }}
    />
  );
}

/** A tab. Same behaviour in the rail and the dock, so they cannot drift. */
function NavLink({
  href,
  active,
  onNavigate,
  children,
  ...rest
}: React.ComponentProps<typeof Link> & {
  active: boolean;
  onNavigate: () => void;
}) {
  const onActiveTap = useScrollTopOnActive(active);
  return (
    <Link
      href={href}
      {...rest}
      onClick={(event) => {
        onActiveTap(event);
        if (!active) onNavigate();
      }}
    >
      {children}
    </Link>
  );
}

/** Desktop: a floating sticker column. */
export function NavRail() {
  const isActive = useActive();
  const activeIndex = NAV_ITEMS.findIndex((i) => isActive(i.href));
  const { listRef, box, index, aimAt } = usePill(activeIndex);

  return (
    <nav
      aria-label="Main"
      className="fixed top-1/2 left-5 z-40 hidden -translate-y-1/2 lg:block"
    >
      <ul ref={listRef} className="sticker relative flex flex-col gap-1 p-2.5">
        <Pill
          box={box}
          color={NAV_ITEMS[index]?.color ?? "transparent"}
          radius="rounded-2xl"
        />
        {NAV_ITEMS.map((item, i) => {
          const active = isActive(item.href);
          return (
            <li key={item.href}>
              <NavLink
                href={item.href}
                active={active}
                onNavigate={() => aimAt(i)}
                // Dynamic routes only prefetch as far as loading.tsx by
                // default, so a tab tap still waited on the server for its
                // data. There are five tabs and one user; fully prefetching
                // them is cheap and makes switching feel instant.
                prefetch
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex w-[74px] flex-col items-center gap-1 rounded-2xl py-3 transition-colors",
                  active ? "text-[var(--on-candy)]" : "text-[var(--ink-soft)] hover:text-[var(--ink)]",
                )}
              >
                <motion.span
                  className="relative text-xl leading-none"
                  aria-hidden
                  animate={
                    active ? { y: [-1, -5, -1], rotate: [0, 8, 0] } : { y: 0, rotate: 0 }
                  }
                  transition={{ duration: 1.6, repeat: active ? Infinity : 0 }}
                >
                  {item.emoji}
                </motion.span>
                <span className="relative text-[0.65rem] font-bold">
                  {item.label}
                </span>
              </NavLink>
            </li>
          );
        })}
      </ul>

      <div className="mt-2 flex justify-center border-t border-[var(--border)] pt-2.5">
        <ThemeToggle className="scale-90" />
      </div>
    </nav>
  );
}

/** Mobile: a chunky bottom dock. */
export function NavDock() {
  const isActive = useActive();
  const activeIndex = NAV_ITEMS.findIndex((i) => isActive(i.href));
  const { listRef, box, index, aimAt } = usePill(activeIndex);

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <div className="mx-2 mb-2 rounded-[1.75rem] bg-[var(--card)] px-1.5 py-1.5 shadow-[0_-2px_24px_-8px_rgb(123_97_255_/_0.35),0_4px_0_0_var(--lip)]">
        <ul ref={listRef} className="relative flex items-stretch justify-between">
          <Pill
            box={box}
            color={NAV_ITEMS[index]?.color ?? "transparent"}
            radius="rounded-3xl"
          />
          {NAV_ITEMS.map((item, i) => {
            const active = isActive(item.href);
            return (
              <li key={item.href} className="flex-1">
                <NavLink
                  href={item.href}
                  active={active}
                  onNavigate={() => aimAt(i)}
                  prefetch
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-[54px] flex-col items-center justify-center gap-0.5 rounded-3xl px-1 transition-colors",
                    active ? "text-[var(--on-candy)]" : "text-[var(--ink-soft)]",
                  )}
                >
                  <motion.span
                    className="relative text-lg leading-none"
                    aria-hidden
                    animate={active ? { y: [0, -4, 0] } : { y: 0 }}
                    transition={{ duration: 1.6, repeat: active ? Infinity : 0 }}
                  >
                    {item.emoji}
                  </motion.span>
                  <span className="relative text-[0.6rem] font-bold">
                    {item.label}
                  </span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

export function BrandLockup({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="text-2xl" aria-hidden>
        🍓
      </span>
      <span className="font-[family-name:var(--font-display)] text-xl font-bold text-[var(--ink)]">
        Macronaut
      </span>
    </span>
  );
}
