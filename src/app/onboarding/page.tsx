import { redirect } from "next/navigation";

import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { CandyBackground } from "@/components/shell/candy-background";
import { getSession, getStore } from "@/lib/session";

// Decides where to send the user from live session state — never prerender.
export const dynamic = "force-dynamic";

export const metadata = { title: "Getting set up" };

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect("/welcome");

  const store = await getStore();
  const profile = await store.getProfile(session.userId);

  return (
    <div className="relative min-h-svh">
      <CandyBackground />
      {/* A landmark so screen readers can jump past the decorative backdrop. */}
      <main>
        <OnboardingFlow
          initialName={
            profile?.displayName ??
            session.name ??
            session.email?.split("@")[0] ??
            null
          }
        />
      </main>
    </div>
  );
}
