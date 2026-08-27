"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { motion } from "motion/react";

import { SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * A little day/night switch. The knob slides, the sky behind it changes, and a
 * sun swaps for a moon — worth the few extra lines to make a settings control
 * feel like part of the same toy.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  // The server cannot know which theme the browser resolved, so the switch
  // renders a placeholder until hydration. useSyncExternalStore gives us that
  // "am I on the client yet" bit without a setState-in-effect.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const isDark = resolvedTheme === "dark";

  if (!mounted) {
    return (
      <span
        className={cn("block h-9 w-16 rounded-full bg-[var(--muted)]", className)}
        aria-hidden
      />
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "relative h-9 w-16 shrink-0 rounded-full p-1 transition-all hover:brightness-105 active:scale-95",
        isDark ? "bg-[#2b2543]" : "bg-[#cfe6ff]",
        className,
      )}
    >
      {/* tiny stars, only at night */}
      <motion.span
        className="pointer-events-none absolute inset-0"
        animate={{ opacity: isDark ? 1 : 0 }}
        transition={{ duration: 0.3 }}
        aria-hidden
      >
        <span className="absolute top-2 left-3 size-[3px] rounded-full bg-white/80" />
        <span className="absolute top-5 left-6 size-[2px] rounded-full bg-white/60" />
        <span className="absolute top-3 left-8 size-[2px] rounded-full bg-white/50" />
      </motion.span>

      <motion.span
        className="relative grid size-7 place-items-center rounded-full text-[13px] shadow-sm"
        style={{ background: isDark ? "#F3EDFF" : "#FFD34D" }}
        animate={{ x: isDark ? 28 : 0, rotate: isDark ? 0 : 40 }}
        transition={SPRING.pop}
      >
        <span aria-hidden>{isDark ? "🌙" : "☀️"}</span>
      </motion.span>
    </button>
  );
}
