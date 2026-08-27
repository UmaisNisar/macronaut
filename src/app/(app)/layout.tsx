import type { ReactNode } from "react";
import { redirect } from "next/navigation";

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
      <NavRail />
      <NavDock />
      <main className="mx-auto w-full max-w-5xl px-4 pt-5 pb-32 sm:px-6 lg:pt-10 lg:pb-16 lg:pl-[132px]">
        <SwipeNav>
          <PageShell>{children}</PageShell>
        </SwipeNav>
      </main>
    </div>
  );
}
