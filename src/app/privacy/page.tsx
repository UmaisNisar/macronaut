import Link from "next/link";
import type { ReactNode } from "react";

import { CandyBackground } from "@/components/shell/candy-background";
import { Momo } from "@/components/mascot/momo";

export const metadata = { title: "Privacy" };

const REPO = "https://github.com/UmaisNisar/macronaut";

/**
 * What the app keeps and who else sees it, in plain words.
 *
 * Written from what the code and the schema actually do rather than from a
 * template, so it has to change when they do.
 */
export default function PrivacyPage() {
  return (
    <div className="relative min-h-svh">
      <CandyBackground />
      <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-16">
        <div className="sticker p-6 sm:p-9">
          <header className="flex items-center gap-4">
            <Momo mood="idle" size={72} />
            <div>
              <p className="label-cute">Macronaut</p>
              <h1 className="mt-0.5 text-2xl font-bold sm:text-3xl">Privacy</h1>
            </div>
          </header>

          <p className="mt-5 text-sm leading-relaxed font-medium text-[var(--ink-soft)]">
            Macronaut is a personal project with open source code. It keeps what
            it needs to track your meals and your progress, shows no ads, and
            sells nothing.
          </p>

          <Section title="What is kept">
            <li>Your email address and name, from signing in.</li>
            <li>
              What you enter in onboarding: age, sex, height, weights and your
              goal.
            </li>
            <li>
              Meals you log, including the words you typed, plus your weigh-ins,
              coach notes, reports and achievements.
            </li>
            <li>
              A daily count of how often you used each feature, so one account
              cannot overload the service.
            </li>
            <li>
              Error reports from the app: what went wrong, and on which page.
            </li>
            <li>Your device&rsquo;s push subscription, if you turn reminders on.</li>
            <li>Your Gemini key, encrypted, if you add one.</li>
          </Section>

          <Section title="What is not">
            <li>
              Meal photos. They go to Google to be read, and are never saved.
            </li>
            <li>Anything for advertising, and nothing is sold or shared for it.</li>
          </Section>

          <Section title="Who else handles it">
            <li>
              <b>Supabase</b> runs the database and the sign-in.
            </li>
            <li>
              <b>Vercel</b> hosts the app and counts page views and loading speed,
              without cookies.
            </li>
            <li>
              <b>Google Gemini</b> reads the meals and photos you log and writes
              the coaching notes. It is sent under your own key, so Google&rsquo;s
              Gemini API terms for that key apply — on the free tier, Google may
              use what is sent to improve its products.
            </li>
            <li>
              <b>Open Food Facts</b> receives the barcode number when you scan
              something. Nothing else.
            </li>
          </Section>

          <Section title="Your Gemini key">
            <li>Checked with Google when you add it, then stored encrypted.</li>
            <li>
              Used only for your own meals, notes and reports, and never shown
              back to you or anyone else — only its last four characters.
            </li>
            <li>
              Remove it any time in <b>You → Momo&rsquo;s AI</b>, or delete the
              key in Google AI Studio to switch it off everywhere.
            </li>
          </Section>

          <Section title="Your controls">
            <li>
              Download everything you have logged from <b>You</b>.
            </li>
            <li>
              <b>Reset</b> wipes your data and starts you over.
            </li>
            <li>
              <b>Delete my account</b> removes your data, your key and your
              sign-in.
            </li>
          </Section>

          <p className="mt-7 rounded-2xl bg-[var(--inset)] px-4 py-3 text-xs leading-relaxed font-medium text-[var(--ink-soft)]">
            Numbers in Macronaut are estimates for spotting trends, not medical
            advice. Questions, or something here looks wrong?{" "}
            <a
              href={`${REPO}/issues`}
              target="_blank"
              rel="noreferrer"
              className="font-bold text-[var(--violet)] underline underline-offset-4"
            >
              Open an issue
            </a>
            .
          </p>

          <p className="mt-6 text-center">
            <Link
              href="/"
              className="text-sm font-bold text-[var(--violet)] underline underline-offset-4"
            >
              Back to Macronaut
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="text-base font-bold">{title}</h2>
      <ul className="mt-2.5 list-disc space-y-1.5 pl-5 text-sm leading-relaxed font-medium text-[var(--ink-soft)] marker:text-[var(--violet)]">
        {children}
      </ul>
    </section>
  );
}
