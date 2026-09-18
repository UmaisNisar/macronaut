import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { InstallPrompt } from "@/components/shell/install-prompt";
import { CandyBackground } from "@/components/shell/candy-background";
import { NavDock, NavRail } from "@/components/shell/nav";
import { PageShell } from "@/components/shell/page-shell";
import { SwipeNav } from "@/components/shell/swipe-nav";
import { TimezoneSync } from "@/components/shell/timezone-sync";
import { getSession } from "@/lib/session";

/**
 * The shell around every tab: background, navigation, and the page itself.
 *
 * It waits for the session — a signature check on a token already in hand,
 * with no database in it — and nothing else. It used to load the profile here
 * too, to send anyone unonboarded to /onboarding, and because a layout
 * renders before its page that put a round trip to the database in front of
 * the *entire* screen: a cold start showed nothing at all, not even the
 * navigation, until the query came back. Every page under here already calls
 * requireProfile or onboardedProfile, which redirects exactly the same way,
 * so the check was duplicated as well as expensive. Now the shell paints
 * immediately and the page streams into it behind its own skeleton.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/welcome");

  // svh, not dvh. `dvh` is defined to track the viewport as Safari's toolbar
  // collapses and expands, so a full-height container using it reflows the
  // page in the middle of a scroll — which reads as the app moving on its own.
  // `svh` is the stable smallest height and never changes mid-gesture.
  return (
    <div className="relative min-h-svh">
      <CandyBackground />
      <TimezoneSync />
      
      <InstallPrompt />
      <NavRail />
      <NavDock />
      {/*
        Keyboard users hit five nav tabs before reaching the page on every
        navigation. Hidden until focused, so it costs nothing visually.
      */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-full focus:bg-[var(--violet-solid)] focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
      >
        Skip to content
      </a>
      <main
        id="main"
        tabIndex={-1}
        /*
          pb-32 on a phone clears the dock. Desktop has no dock -- the nav
          is a rail on the left -- so its bottom padding is only breathing
          room, and 64px of it was enough to push a page that otherwise
          fitted into a two-pixel scroll. Matched to the top instead.
        */
        className="mx-auto w-full max-w-5xl px-4 pt-5 pb-32 sm:px-6 lg:pt-10 lg:pb-10 lg:pl-[132px]"
      >
        <SwipeNav>
          <PageShell>{children}</PageShell>
        </SwipeNav>
      </main>
    </div>
  );
}
