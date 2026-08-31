"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";

import { NAV_ITEMS } from "@/lib/nav-items";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { SPRING } from "@/lib/motion";
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

/** A tab. Same behaviour in the rail and the dock, so they cannot drift. */
function NavLink({
  href,
  active,
  children,
  ...rest
}: React.ComponentProps<typeof Link> & { active: boolean }) {
  const onActiveTap = useScrollTopOnActive(active);
  return (
    <Link href={href} {...rest} onClick={onActiveTap}>
      {children}
    </Link>
  );
}

/** Desktop: a floating sticker column. */
export function NavRail() {
  const isActive = useActive();

  return (
    <nav
      aria-label="Main"
      className="fixed top-1/2 left-5 z-40 hidden -translate-y-1/2 lg:block"
    >
      <ul className="sticker flex flex-col gap-1 p-2.5">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href}>
              <NavLink
                href={item.href}
                active={active}
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
                {active && (
                  <motion.span
                    layoutId="rail-blob"
                    className="absolute inset-0 rounded-2xl"
                    style={{ background: item.color }}
                    transition={SPRING.nav}
                  />
                )}
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

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <div className="mx-2 mb-2 rounded-[1.75rem] bg-[var(--card)] px-1.5 py-1.5 shadow-[0_-2px_24px_-8px_rgb(123_97_255_/_0.35),0_4px_0_0_var(--lip)]">
        <ul className="flex items-stretch justify-between">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.href} className="flex-1">
                <NavLink
                  href={item.href}
                  active={active}
                  prefetch
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-[54px] flex-col items-center justify-center gap-0.5 rounded-3xl px-1 transition-colors",
                    active ? "text-[var(--on-candy)]" : "text-[var(--ink-soft)]",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="dock-blob"
                      // No -z-10 here: a negative index pushes the pill behind
                      // the dock's own opaque background, leaving white text on
                      // white. The labels below are `relative`, so normal paint
                      // order already puts them above this. Matches the rail.
                      className="absolute inset-0 rounded-3xl"
                      style={{ background: item.color }}
                      transition={SPRING.nav}
                    />
                  )}
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
