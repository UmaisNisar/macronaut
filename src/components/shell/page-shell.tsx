"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Holds the page while the tab changes.
 *
 * It used to slide each page in from the side and cross-fade it out, with
 * `mode="wait"` so the old page had to finish leaving before the new one was
 * even mounted — a wipe, plus a tenth of a second of pure waiting on every
 * tab. Together with cards that scaled into place, a tab change read as the
 * whole screen bouncing rather than as arriving somewhere.
 *
 * Now the page simply appears, and only its *contents* fade — the sticker
 * surfaces are painted at full opacity from the first frame, so the shapes on
 * screen never move. The key is the pathname, which restarts that fade for
 * each new page (see .page-enter in globals.css).
 */
export function PageShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
