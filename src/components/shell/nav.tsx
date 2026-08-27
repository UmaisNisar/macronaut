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
              <Link
                href={item.href}
                // Dynamic routes only prefetch as far as loading.tsx by
                // default, so a tab tap still waited on the server for its
                // data. There are five tabs and one user; fully prefetching
                // them is cheap and makes switching feel instant.
                prefetch
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex w-[74px] flex-col items-center gap-1 rounded-2xl py-3 transition-colors",
                  active ? "text-white" : "text-[var(--ink-soft)] hover:text-[var(--ink)]",
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
              </Link>
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
                <Link
                  href={item.href}
                  prefetch
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-[54px] flex-col items-center justify-center gap-0.5 rounded-3xl px-1 transition-colors",
                    active ? "text-white" : "text-[var(--ink-soft)]",
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
                </Link>
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
