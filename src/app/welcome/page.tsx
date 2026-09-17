import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthPanel } from "@/components/auth/auth-panel";
import { CandyBackground } from "@/components/shell/candy-background";
import { BrandLockup } from "@/components/shell/nav";
import { Momo } from "@/components/mascot/momo";
import { Button } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/env";
import { getSession, getStore } from "@/lib/session";

// Decides where to send the user from live session state — never prerender.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Macronaut — your cute little food buddy",
};

const PILLARS = [
  {
    emoji: "💬",
    title: "Just tell it",
    body: "“Cheeseburger, medium fries and a Diet Coke.” That's the whole thing. Momo figures out the portions and the macros.",
    tint: "tint-violet",
  },
  {
    emoji: "📈",
    title: "One question",
    body: "Am I actually improving? Every screen compares you to last week — not to some stranger's idea of perfect.",
    tint: "tint-mint",
  },
  {
    emoji: "🫂",
    title: "A buddy, not a scoreboard",
    body: "Honest little debriefs, weigh-ins put in context, weekly recaps. Never a guilt trip, never a red number shouting at you.",
    tint: "tint-violet",
  },
];

export default async function WelcomePage(props: PageProps<"/welcome">) {
  const search = await props.searchParams;
  const authError = typeof search.error === "string" ? search.error : undefined;
  const session = await getSession();
  if (session) {
    const store = await getStore();
    const profile = await store.getProfile(session.userId);
    if (profile?.onboardedAt) redirect("/today");
    // A signed-in pilot with no profile has nothing to do here — the panel
    // below is a sign-in form they have already used. Send them to setup.
    if (session.mode === "supabase") redirect("/onboarding");
  }

  return (
    <div className="relative min-h-svh overflow-hidden">
      <CandyBackground />

      <div className="mx-auto w-full max-w-6xl px-5 py-10 lg:py-16">
        <BrandLockup className="mb-8" />

        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-16">
          <div>
            <div className="mb-4 flex items-end gap-3">
              <Momo mood="excited" size={110} />
              <div className="bubble bubble-left tint-violet mb-4 px-4 py-3">
                <p className="font-[family-name:var(--font-display)] text-sm font-semibold">
                  hi!! i&rsquo;m Momo 👋
                </p>
              </div>
            </div>

            <h1 className="text-4xl leading-[1.08] font-bold text-balance sm:text-5xl">
              Tell me what you ate.
              <br />
              <span className="text-[var(--violet)]">I&rsquo;ll do the maths</span>{" "}
              and cheer you on.
            </h1>

            <p className="mt-5 max-w-xl text-base font-medium text-pretty text-[var(--ink-soft)] sm:text-lg">
              Macronaut is a sweet little AI food buddy that actually remembers.
              Every meal, every weigh-in, every week — turned into one clear
              answer about whether you&rsquo;re getting where you want to go.
            </p>

            <dl className="mt-9 grid gap-3 sm:grid-cols-3">
              {PILLARS.map((p) => (
                <div key={p.title} className={`sticker ${p.tint} p-4`}>
                  <dt className="mb-1.5 flex items-center gap-2 text-sm font-bold">
                    <span className="text-lg" aria-hidden>
                      {p.emoji}
                    </span>
                    {p.title}
                  </dt>
                  <dd className="text-xs leading-relaxed font-medium text-pretty text-[var(--ink-soft)]">
                    {p.body}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="lg:pl-4">
            {isSupabaseConfigured ? (
              <AuthPanel initialError={authError} />
            ) : (
              <div className="sticker tint-mint p-7 text-center">
                <Momo mood="curious" size={96} className="mx-auto" />
                <h2 className="mt-3 text-xl font-bold">No account needed!</h2>
                <p className="mt-2 text-sm font-medium text-pretty text-[var(--ink-soft)]">
                  Supabase isn&rsquo;t set up, so everything lives in a little
                  file on this machine. Add keys later and the same app becomes a
                  proper signed-in one.
                </p>
                <Button
                  size="lg"
                  variant="mint"
                  className="mt-5 w-full"
                  nativeButton={false}
                  render={<Link href="/onboarding" />}
                >
                  Start with Momo 🚀
                </Button>
              </div>
            )}

            <p className="mt-4 px-2 text-center text-xs leading-relaxed font-medium text-[var(--ink-soft)]">
              Momo gives estimates, not medical advice — great for spotting
              trends, not for clinical decisions.
              {isSupabaseConfigured ? (
                <>
                  {" "}
                  The AI runs on your own free Gemini key, added during setup.
                </>
              ) : null}{" "}
              <Link
                href="/privacy"
                className="font-bold text-[var(--violet)] underline underline-offset-4"
              >
                Privacy
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
