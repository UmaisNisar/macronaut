"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Media query as reactive state, without a setState-in-effect. Returns false
 * during SSR, which is the safe default for every query we use it for.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined") return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** True on phones and tablets — anything without a precise pointer. */
export const useIsTouch = () => useMediaQuery("(pointer: coarse)");
