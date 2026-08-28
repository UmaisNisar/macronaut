"use client";

import { Toaster } from "sonner";

import { useMediaQuery } from "@/lib/use-media-query";

/**
 * Where messages appear.
 *
 * On a phone they go to the top. The bottom of a phone screen is the thumb
 * zone and the nav dock lives there, so a toast in that corner covers the
 * navigation and is easy to press by accident — and easy to miss entirely if
 * you have scrolled somewhere else. The top is also where iOS puts its own
 * banners, so it is where people already look.
 *
 * On a pointer device the bottom-right corner is the convention and stays.
 */
export function AppToaster() {
  // Server snapshot is false, so this renders the desktop position first and
  // corrects after hydration — a toast cannot exist before then anyway.
  const isPhone = useMediaQuery("(max-width: 639px)");

  return (
    <Toaster
      position={isPhone ? "top-center" : "bottom-right"}
      offset={{ bottom: 20, right: 20 }}
      mobileOffset={{ top: 12, left: 12, right: 12 }}
      toastOptions={{
        classNames: {
          toast:
            "!bg-[var(--card)] !border-0 !rounded-[1.5rem] !text-[var(--ink)] !font-semibold !shadow-[0_4px_0_0_var(--lip),0_12px_32px_-12px_rgb(123_97_255_/_0.4)]",
          description: "!text-[var(--ink-soft)] !font-medium",
        },
      }}
    />
  );
}
