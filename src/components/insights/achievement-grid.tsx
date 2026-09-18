"use client";

import { motion } from "motion/react";
import { Lock } from "lucide-react";

import { ACHIEVEMENTS, type AchievementTier } from "@/lib/achievements";
import { shortDayLabel, type Iso } from "@/lib/date";
import { SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

const TIER: Record<AchievementTier, { color: string; soft: string }> = {
  bronze: { color: "var(--peach)", soft: "var(--peach-soft)" },
  silver: { color: "var(--sky)", soft: "var(--sky-soft)" },
  gold: { color: "var(--sun)", soft: "var(--sun-soft)" },
};

export function AchievementGrid({ unlocked }: { unlocked: Map<string, Iso> }) {
  return (
    <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      {ACHIEVEMENTS.map((achievement, i) => {
        const on = unlocked.get(achievement.key);
        const tier = TIER[achievement.tier];

        return (
          <motion.li
            key={achievement.key}
            transition={SPRING.pop}
            whileHover={on ? { y: -4, rotate: i % 2 ? -2 : 2 } : { y: -2 }}
            className={cn(
              "relative flex flex-col items-center rounded-3xl px-3 py-4 text-center",
              on ? "bg-[var(--inset)]" : "bg-[var(--muted)]/60",
            )}
            style={{
              boxShadow: on ? `0 4px 0 0 ${tier.soft}` : "none",
            }}
          >
            <span
              className={cn(
                "grid size-12 place-items-center rounded-full text-2xl",
                !on && "opacity-45",
              )}
              style={{ background: on ? tier.soft : "var(--muted)" }}
              aria-hidden
            >
              {on ? (
                achievement.emoji
              ) : (
                <Lock className="size-4 text-[var(--ink-soft)]" />
              )}
            </span>

            <p
              className={cn(
                "mt-2 text-xs leading-tight font-bold",
                !on && "text-[var(--ink-soft)]",
              )}
            >
              {achievement.name}
            </p>
            <p className="mt-1 text-[0.68rem] leading-snug font-medium text-[var(--ink-soft)]">
              {achievement.description}
            </p>
            {on ? (
              <p
                className="label-cute mt-1.5 text-[0.5rem]"
                style={{ color: tier.color }}
              >
                {shortDayLabel(on)}
              </p>
            ) : null}
          </motion.li>
        );
      })}
    </ul>
  );
}
