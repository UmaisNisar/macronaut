"use client";

import { Minus, Plus } from "lucide-react";

import { Haptic } from "@/components/ui/haptic";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A number field with nudge buttons either side.
 *
 * Typing stays available, because jumping to a value nowhere near the current
 * one is still fastest on a keyboard. The buttons are for the far more common
 * case: a weigh-in a few hundred grams from yesterday's, where opening a
 * numeric keyboard to change one digit is the slowest possible way to do it.
 *
 * Each nudge carries a haptic. That rules out press-and-hold to repeat: the
 * iOS tick comes from a real switch overlaid on the control, and that overlay
 * takes the pointer events a hold would need. Given typing covers large
 * changes, a tick on every tap is the better half of that trade.
 */
export function StepperField({
  id,
  name,
  value,
  onChange,
  step = 0.1,
  min = 0,
  max = 1000,
  suffix,
  autoFocus,
  className,
  inputClassName,
}: {
  id: string;
  name?: string;
  value: string;
  onChange: (next: string) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  autoFocus?: boolean;
  className?: string;
  inputClassName?: string;
}) {
  /** Match displayed precision to the step, so 80 + 0.1 reads as "80.1". */
  const decimals = step < 1 ? 1 : 0;

  function nudge(direction: 1 | -1) {
    const current = Number.parseFloat(value);
    const base = Number.isFinite(current) ? current : min;
    const next = Math.min(max, Math.max(min, base + direction * step));
    onChange(next.toFixed(decimals));
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Haptic>
        <button
          type="button"
          aria-label={`Decrease by ${step}`}
          onClick={() => nudge(-1)}
          className="tappable grid size-11 shrink-0 place-items-center rounded-full bg-[var(--muted)] text-[var(--ink-soft)] sm:size-10"
        >
          <Minus className="size-4" />
        </button>
      </Haptic>

      <Input
        id={id}
        name={name}
        inputMode="decimal"
        // `text`, not `number`: a number input draws its own tiny spinners on
        // desktop, which would sit beside these and look like a mistake.
        type="text"
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        className={cn("numeral text-center", inputClassName)}
      />

      <Haptic>
        <button
          type="button"
          aria-label={`Increase by ${step}`}
          onClick={() => nudge(1)}
          className="tappable grid size-11 shrink-0 place-items-center rounded-full bg-[var(--muted)] text-[var(--ink-soft)] sm:size-10"
        >
          <Plus className="size-4" />
        </button>
      </Haptic>

      {suffix ? (
        <span className="shrink-0 text-base font-bold text-[var(--ink-soft)]">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}
