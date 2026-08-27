"use client";

import { useSyncExternalStore } from "react";

/**
 * Haptics, such as they are on the web.
 *
 * Android and anything else that implements the Vibration API gets a real
 * `navigator.vibrate()`. iOS never shipped it, and the long-standing
 * workaround — toggling a hidden `<input type="checkbox" switch>` from
 * JavaScript — was patched in iOS 26.5. What still reaches the Taptic Engine is
 * a *direct user tap* on a real switch control, which is why the iOS path is a
 * component that overlays one (see components/ui/haptic.tsx) rather than a
 * function anything can call.
 *
 * The consequence is worth stating plainly: on iOS a tick can only land on the
 * tap itself, never on an outcome that arrives a second later. Async moments
 * still buzz on Android and stay silent on iPhone.
 */

export type HapticKind = "tap" | "success";

/** Deliberately short. A long buzz reads as an error, not a confirmation. */
const PATTERN: Record<HapticKind, number | number[]> = {
  tap: 12,
  success: [14, 40, 22],
};

/** Safe everywhere: unsupported browsers simply do nothing. */
export function vibrate(kind: HapticKind = "tap"): void {
  if (typeof navigator === "undefined") return;
  try {
    navigator.vibrate?.(PATTERN[kind]);
  } catch {
    // Some browsers throw when the page is not visible. Never worth an error.
  }
}

export function isIosTouch(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac, so touch points are the giveaway.
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  );
}

const subscribe = () => () => {};

/**
 * Read during render via useSyncExternalStore so this never becomes a
 * setState-in-effect, and so the server snapshot is a stable `false`.
 */
export function useIsIosTouch(): boolean {
  return useSyncExternalStore(subscribe, isIosTouch, () => false);
}
