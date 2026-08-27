import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { ErrorReporter } from "@/components/shell/error-reporter";
import { InstallPrompt } from "@/components/shell/install-prompt";
import { CandyBackground } from "@/components/shell/candy-background";
import { NavDock, NavRail } from "@/components/shell/nav";
import { PageShell } from "@/components/shell/page-shell";
import { SwipeNav } from "@/components/shell/swipe-nav";
import { TimezoneSync } from "@/components/shell/timezone-sync";
import { getCurrentProfile, getSession } from "@/lib/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/welcome");

  const profile = await getCurrentProfile();
  if (!profile?.onboardedAt) redirect("/onboarding");

  return (
    <div className="relative min-h-dvh">
      <CandyBackground />
      <TimezoneSync />
      <ErrorReporter />
      <InstallPrompt />
      <NavRail />
      <NavDock />
      {/*
        Keyboard users hit five nav tabs before reaching the page on every
        navigation. Hidden until focused, so it costs nothing visually.
      */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-full focus:bg-[var(--violet)] focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
      >
        Skip to content
      </a>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-5xl px-4 pt-5 pb-32 sm:px-6 lg:pt-10 lg:pb-16 lg:pl-[132px]"
      >
        <SwipeNav>
          <PageShell>{children}</PageShell>
        </SwipeNav>
      </main>
    </div>
  );
}
