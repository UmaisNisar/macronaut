"use client";

import { useRef, type ReactNode } from "react";

import { useIsIosTouch, vibrate, type HapticKind } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/**
 * Wraps a single tappable control so committing an action has a physical tick.
 *
 * Two completely different mechanisms hide behind this:
 *
 * - Everywhere the Vibration API exists, we just call it on pointerdown and
 *   leave the layout untouched.
 * - On iOS there is no API, so we lay a real (invisible) WebKit switch over the
 *   control. The finger lands on the switch, iOS plays its own tick because a
 *   human genuinely toggled a system control, and we forward the tap to the
 *   button underneath. Toggling that switch from JavaScript instead — what
 *   every haptics library used to do — stopped working in iOS 26.5.
 *
 * Because the overlay swallows the real touch, `:active` styling on the child
 * would never fire, so the press-down scale is reproduced here off the input's
 * own active state. Keyboard users never meet the overlay: it is aria-hidden
 * and untabbable, so the button underneath stays the real, accessible control.
 */
export function Haptic({
  children,
  kind = "tap",
  className,
}: {
  children: ReactNode;
  kind?: HapticKind;
  className?: string;
}) {
  const ios = useIsIosTouch();
  const host = useRef<HTMLSpanElement | null>(null);

  // Both platforms render the SAME box. An earlier version used
  // `display: contents` off-iOS, which silently dropped this className and let
  // a layout regression ship that could not be reproduced on a desktop. Keeping
  // one box means what you see here is what iPhones get.
  return (
    <span
      ref={host}
      className={cn(
        "relative inline-flex transition-transform has-[input:active]:scale-[0.97]",
        className,
      )}
      onPointerDown={ios ? undefined : () => vibrate(kind)}
    >
      {children}
      {ios ? (
        <input
          type="checkbox"
          aria-hidden
          tabIndex={-1}
          // Not in React's JSX types: this is WebKit's native switch control,
          // and it is the switch-ness that produces the haptic.
          {...({ switch: "" } as Record<string, string>)}
          className="absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0"
          onChange={(event) => {
            // Snap back so the next tap is another real off -> on toggle.
            // Assigning `checked` does not re-dispatch change, so this cannot loop.
            event.currentTarget.checked = false;
            host.current
              ?.querySelector<HTMLElement>('button, a, [role="button"]')
              ?.click();
          }}
        />
      ) : null}
    </span>
  );
}
