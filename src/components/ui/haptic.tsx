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
/** Movement past this many pixels means the finger is scrolling, not tapping. */
const SLOP = 8;

export function Haptic({
  children,
  kind = "tap",
  className,
  pan = false,
}: {
  children: ReactNode;
  kind?: HapticKind;
  className?: string;
  /** Set on anything living inside a horizontally scrolling container. */
  pan?: boolean;
}) {
  const ios = useIsIosTouch();
  const host = useRef<HTMLSpanElement | null>(null);

  /** Where the finger went down, so a scroll can be told from a tap. */
  const gesture = useRef<{
    x: number;
    y: number;
    at: number;
    moved: boolean;
  } | null>(null);

  /*
   * Inside something that scrolls sideways, the overlay has to go.
   *
   * The iOS tick comes from a real switch laid over the control, and a switch
   * is a thing you drag horizontally — that is how you operate one. Sitting on
   * top of a horizontal strip it claims every sideways pan, so the strip could
   * not be scrolled at all. An earlier fix stopped the drag *logging* the food,
   * which made the symptom quieter without giving the gesture back.
   *
   * There is no way to keep both: the element that produces the haptic is the
   * element that eats the scroll. Scrolling wins, so these controls tick on
   * Android and stay silent on iOS.
   */
  if (pan) {
    return (
      <span
        ref={host}
        className={cn("relative inline-flex", className)}
        onPointerDown={ios ? undefined : () => vibrate(kind)}
      >
        {children}
      </span>
    );
  }

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
          onPointerDown={(event) => {
            gesture.current = { x: event.clientX, y: event.clientY, at: Date.now(), moved: false };
          }}
          onPointerMove={(event) => {
            const g = gesture.current;
            if (!g) return;
            // A finger that has travelled this far is scrolling, not tapping.
            if (Math.hypot(event.clientX - g.x, event.clientY - g.y) > SLOP) {
              g.moved = true;
            }
          }}
          // The browser taking the gesture over for scrolling is the clearest
          // possible signal that it was never a tap.
          onPointerCancel={() => {
            if (gesture.current) gesture.current.moved = true;
          }}
          onChange={(event) => {
            // Snap back so the next tap is another real off -> on toggle.
            // Assigning `checked` does not re-dispatch change, so this cannot loop.
            event.currentTarget.checked = false;

            const g = gesture.current;
            gesture.current = null;

            /*
             * A native switch is not a button: iOS toggles it on a *drag* as
             * well as a tap. Overlaid on a scrollable list, that meant a
             * vertical scroll beginning on a repeat chip silently logged the
             * food again. A button would never have done this, so the guard
             * has to be added back by hand.
             */
            if (g && (g.moved || Date.now() - g.at > 700)) return;

            host.current
              ?.querySelector<HTMLElement>('button, a, [role="button"]')
              ?.click();
          }}
        />
      ) : null}
    </span>
  );
}
