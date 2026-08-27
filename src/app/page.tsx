import { redirect } from "next/navigation";

import { getSession, getStore } from "@/lib/session";

// Decides where to send the user from live session state — never prerender.
export const dynamic = "force-dynamic";

export default async function RootPage() {
  const session = await getSession();
  if (!session) redirect("/welcome");

  const store = await getStore();
  const profile = await store.getProfile(session.userId);
  if (profile?.onboardedAt) redirect("/today");

  // Solo mode has a session from the start, so "no profile" is what marks a new
  // pilot — show them the landing page first. Someone who has actually signed
  // in has already seen it, and sending them back would be a dead end.
  redirect(session.mode === "solo" ? "/welcome" : "/onboarding");
}
