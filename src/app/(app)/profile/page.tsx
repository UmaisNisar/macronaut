import { Check, Minus } from "lucide-react";

import { DangerZone } from "@/components/profile/danger-zone";
import { ErrorLog } from "@/components/profile/error-log";
import { ExportData } from "@/components/profile/export-data";
import { ReminderSettings } from "@/components/profile/reminder-settings";
import { SignOutButton } from "@/components/profile/sign-out-button";
import { GoalEditor } from "@/components/profile/goal-editor";
import { MomoGreeter } from "@/components/mascot/momo-greeter";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { AiKeyForm } from "@/components/ai/ai-key-form";
import { resolveAiAccess } from "@/lib/ai/access";
import { Sticker, StickerHeading, Squiggle } from "@/components/kit";
import { onboardedProfile, requireUser } from "@/lib/session";
import { userToday } from "@/lib/server-date";
import {
  geminiModel,
  isPushConfigured,
  isSupabaseConfigured,
  vapid,
} from "@/lib/env";
import { formatHeight, formatWeight } from "@/lib/nutrition";
import { shortDayLabel } from "@/lib/date";

export const metadata = { title: "You" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const { session, store } = await requireUser();
  // Fired together with the page's own queries below rather than before
  // them: the queries only ever needed the id, which the token already has.
  const profilePromise = onboardedProfile();
  const today = await userToday();
  // These were awaited one after the other, which is two crossings to
  // Montreal for two independent lists.
  const [profile, errors, goals, ai] = await Promise.all([
    profilePromise,
    store.listErrors(session.userId, 10),
    store.listGoalSnapshots(session.userId),
    resolveAiAccess(store, { id: session.userId, email: session.email }),
  ]);
  const history = [...goals].reverse().slice(0, 6);

  return (
    <div className="space-y-4 sm:space-y-5">
      <header className="flex items-center gap-3">
        <MomoGreeter mood="idle" size={64} />
        <div className="min-w-0">
          <p className="label-cute">Your bits and pieces</p>
          <h1 className="mt-0.5 text-2xl font-bold sm:text-3xl">
            {profile.displayName || "You"} <span aria-hidden>🌸</span>
          </h1>
          <p className="mt-0.5 text-sm font-medium text-[var(--ink-soft)]">
            {formatHeight(profile.heightCm, profile.units)} · {profile.age} years
            {profile.email ? ` · ${profile.email}` : ""}
          </p>
        </div>
      </header>

      <Sticker tint="violet">
        <StickerHeading
          emoji="🎯"
          title="Your plan"
          hint="Change anything — past days keep their own targets"
          action={
            <span className="label-cute">
              since {shortDayLabel(profile.onboardedAt?.slice(0, 10) ?? today)}
            </span>
          }
        />
        <GoalEditor profile={profile} />
      </Sticker>

      <div id="ai" className="scroll-mt-24">
        <Sticker tint="mint">
          <StickerHeading
            emoji="🧠"
            title="Momo's AI"
            hint={
              ai.source === "none"
                ? "Off — food is guessed from a built-in table"
                : `On — ${geminiModel}`
            }
          />
          {ai.source === "none" && ai.hint ? (
            <p className="mb-3 rounded-2xl bg-[var(--sun-soft)] px-3.5 py-3 text-xs font-semibold text-[var(--sun-text)]">
              The key ending in {ai.hint} can no longer be read on this server.
              Paste it again to switch the AI back on.
            </p>
          ) : null}
          <AiKeyForm
            compact={ai.source !== "none"}
            initial={{
              source: ai.source,
              hint: ai.source === "own" ? ai.hint : null,
            }}
          />
        </Sticker>
      </div>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2 lg:items-start">
        <Sticker tint="violet" tilt={-0.5}>
          <StickerHeading emoji="📜" title="Plan history" />
          {history.length <= 1 ? (
            <p className="text-sm font-medium text-[var(--ink-soft)]">
              Just the one plan so far. When you change a goal, the old one gets
              kept here so your old days still mean what they meant.
            </p>
          ) : (
            <ul className="space-y-2">
              {history.map((goal, i) => (
                <li
                  key={goal.id}
                  className="flex items-center justify-between gap-3 rounded-3xl bg-[var(--inset)] px-4 py-3"
                >
                  <div>
                    <p className="numeral text-sm">
                      {goal.targets.calories.toLocaleString()} kcal ·{" "}
                      {goal.targets.protein}g protein
                    </p>
                    <p className="label-cute mt-1 text-[0.55rem]">
                      from {shortDayLabel(goal.effectiveFrom)} ·{" "}
                      {formatWeight(goal.weightKg, profile.units)} →{" "}
                      {formatWeight(goal.targetWeightKg, profile.units)}
                    </p>
                  </div>
                  {i === 0 ? (
                    <span className="rounded-full bg-[var(--violet-solid)] px-2.5 py-1 text-[0.65rem] font-bold text-white">
                      active
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Sticker>

        <Sticker tilt={0.5}>
          <StickerHeading emoji="🔌" title="What's switched on" />
          <div className="mb-3 flex items-center justify-between gap-3 rounded-3xl bg-[var(--muted)] px-4 py-3">
            <div>
              <p className="text-sm font-bold">Appearance</p>
              <p className="mt-0.5 text-xs font-medium text-[var(--ink-soft)]">
                Follows your system unless you pick one
              </p>
            </div>
            <ThemeToggle />
          </div>

          <ul className="space-y-2">
            <StatusRow
              on={isSupabaseConfigured}
              label="Supabase"
              onText="Connected — your data syncs across devices"
              offText="Solo mode — stored on this machine only"
            />
          </ul>

          {isPushConfigured && isSupabaseConfigured ? (
            <ReminderSettings
              publicKey={vapid.publicKey}
              initialHour={profile.reminderHour}
            />
          ) : null}

          <ErrorLog errors={errors} today={today} />

          <ExportData />

          <Squiggle />

          <p className="text-xs leading-relaxed font-medium text-[var(--ink-soft)]">
            Momo gives estimates using population formulas and a language model.
            They&rsquo;re great for spotting trends over weeks, but they are not
            medical advice — chat to a professional before making big changes,
            especially with a health condition.
          </p>

          {isSupabaseConfigured ? (
            <SignOutButton />
          ) : null}
        </Sticker>
      </div>

      <Sticker tint="sun">
        <StickerHeading emoji="🧹" title="Data" />
        <DangerZone
          showSeed={process.env.NODE_ENV !== "production"}
          canDeleteAccount={isSupabaseConfigured}
        />
      </Sticker>
    </div>
  );
}

function StatusRow({
  on,
  label,
  onText,
  offText,
}: {
  on: boolean;
  label: string;
  onText: string;
  offText: string;
}) {
  return (
    <li className="flex items-start gap-3 rounded-3xl bg-[var(--muted)] px-4 py-3">
      <span
        className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-white"
        style={{ background: on ? "var(--mint)" : "var(--track)" }}
      >
        {on ? (
          <Check className="size-3.5" strokeWidth={3.5} />
        ) : (
          <Minus className="size-3.5 text-[var(--ink-soft)]" strokeWidth={3} />
        )}
      </span>
      <div>
        <p className="text-sm font-bold">{label}</p>
        <p className="mt-0.5 text-xs font-medium text-[var(--ink-soft)]">
          {on ? onText : offText}
        </p>
      </div>
    </li>
  );
}
