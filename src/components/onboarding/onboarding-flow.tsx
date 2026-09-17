"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Momo, type Mood } from "@/components/mascot/momo";
import { Magnet } from "@/components/kit";
import { useCelebration } from "@/components/celebrate/celebration";
import {
  ACTIVITY_COPY,
  achievableWeeklyLoss,
  clamp,
  cmToIn,
  computeJourney,
  computeTargets,
  formatWeight,
  inToCm,
  kgToLb,
  lbToKg,
  round,
} from "@/lib/nutrition";
import {
  ACTIVITY_LEVELS,
  type ActivityLevel,
  type Gender,
  type UnitSystem,
} from "@/lib/schemas";
import { todayIso } from "@/lib/date";
import { completeOnboardingAction } from "@/server/actions";
import { EASE, SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { AiKeyForm } from "@/components/ai/ai-key-form";
import type { AiKeyStatus } from "@/server/actions";

type Draft = {
  displayName: string;
  age: string;
  gender: Gender;
  units: UnitSystem;
  heightCm: number;
  feet: string;
  inches: string;
  weight: string;
  target: string;
  weeklyLossKg: number;
  activityLevel: ActivityLevel;
};

const RATES = [0.25, 0.5, 0.75, 1] as const;

const STEPS = [
  {
    key: "hello",
    emoji: "👋",
    title: "Hi! I'm Momo",
    blurb: "Tell me a little about you and I'll work out your numbers.",
    mood: "excited" as Mood,
  },
  {
    key: "body",
    emoji: "📏",
    title: "Where are we starting?",
    blurb: "No judgement here — this is just the starting line.",
    mood: "curious" as Mood,
  },
  {
    key: "goal",
    emoji: "🎯",
    title: "Where are we heading?",
    blurb: "Pick a pace you could actually keep up.",
    mood: "proud" as Mood,
  },
  {
    key: "move",
    emoji: "🏃",
    title: "How much do you move?",
    blurb: "Roughly is fine. We adjust as your real data comes in.",
    mood: "idle" as Mood,
  },
  {
    key: "ai",
    emoji: "🧠",
    title: "Switch on my AI",
    blurb:
      "I read your meals with Google's Gemini. Bring your own free key and the AI is all yours.",
    mood: "curious" as Mood,
  },
  {
    key: "plan",
    emoji: "✨",
    title: "Here's your plan!",
    blurb: "Check it over, then let's go.",
    mood: "celebrating" as Mood,
  },
] as const;

const numeric = (v: string) => {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

export function OnboardingFlow({
  initialName,
  initialAi,
}: {
  initialName?: string | null;
  initialAi: AiKeyStatus;
}) {
  // Only ask when there is something to ask for: an account already running
  // on the server's key (solo mode, the owner) has nothing to add here. Fixed
  // at mount, so saving a key does not pull the step out from under you.
  const [steps] = useState(() =>
    initialAi.source === "server"
      ? STEPS.filter((s) => s.key !== "ai")
      : [...STEPS],
  );
  const [ai, setAi] = useState(initialAi);
  const router = useRouter();
  const { celebrate } = useCelebration();
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const [direction, setDirection] = useState(1);

  const [draft, setDraft] = useState<Draft>({
    displayName: initialName ?? "",
    age: "30",
    gender: "male",
    units: "metric",
    heightCm: 175,
    feet: "5",
    inches: "9",
    weight: "95",
    target: "80",
    weeklyLossKg: 0.5,
    activityLevel: "light",
  });

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  /* canonical values, whatever unit is being typed in */
  const heightCm =
    draft.units === "metric"
      ? draft.heightCm
      : inToCm(numeric(draft.feet) * 12 + numeric(draft.inches));
  const currentWeightKg =
    draft.units === "metric" ? numeric(draft.weight) : lbToKg(numeric(draft.weight));
  const targetWeightKg =
    draft.units === "metric" ? numeric(draft.target) : lbToKg(numeric(draft.target));
  const age = clamp(Math.round(numeric(draft.age)), 13, 100);

  const plan = useMemo(() => {
    if (currentWeightKg < 30 || heightCm < 120) return null;
    const targets = computeTargets({
      age,
      gender: draft.gender,
      heightCm,
      weightKg: currentWeightKg,
      targetWeightKg: Math.min(targetWeightKg, currentWeightKg),
      weeklyLossKg: draft.weeklyLossKg,
      activityLevel: draft.activityLevel,
    });
    return {
      targets,
      journey: computeJourney({
        startKg: currentWeightKg,
        currentKg: currentWeightKg,
        targetKg: Math.min(targetWeightKg, currentWeightKg),
        weeklyLossKg: achievableWeeklyLoss(targets) || draft.weeklyLossKg,
        fromIsoDate: todayIso(),
      }),
    };
  }, [
    age,
    currentWeightKg,
    draft.activityLevel,
    draft.gender,
    draft.weeklyLossKg,
    heightCm,
    targetWeightKg,
  ]);

  const stepError = (() => {
    if (step === 0 && (age < 13 || age > 100))
      return "Pop in an age between 13 and 100 🙏";
    if (step === 1) {
      if (heightCm < 120 || heightCm > 250) return "That height looks a bit off!";
      if (currentWeightKg < 30 || currentWeightKg > 400)
        return "That weight looks a bit off!";
    }
    if (step === 2) {
      if (targetWeightKg < 30) return "Give me a target weight 🎯";
      if (targetWeightKg > currentWeightKg)
        return "Macronaut is built for fat loss — aim at or below where you are now.";
    }
    return null;
  })();

  function go(next: number) {
    if (next > step && stepError) {
      toast(stepError);
      return;
    }
    setDirection(next > step ? 1 : -1);
    setStep(clamp(next, 0, steps.length - 1));
  }

  function launch() {
    startTransition(async () => {
      const result = await completeOnboardingAction({
        displayName: draft.displayName.trim() || undefined,
        age,
        gender: draft.gender,
        heightCm: round(heightCm, 1),
        currentWeightKg: round(currentWeightKg, 1),
        targetWeightKg: round(Math.min(targetWeightKg, currentWeightKg), 1),
        weeklyLossKg: draft.weeklyLossKg,
        activityLevel: draft.activityLevel,
        units: draft.units,
      });

      if (!result.ok) {
        toast.error(result.error, {
          description: Object.values(result.fieldErrors ?? {})[0],
        });
        return;
      }

      celebrate({
        title: "We're all set! 🎉",
        detail: "Let's go find out what you ate today.",
        emoji: "🚀",
        intensity: "big",
      });
      router.replace("/today");
      router.refresh();
    });
  }

  const unit = draft.units === "metric" ? "kg" : "lb";
  const current = steps[step];
  const skippable = current.key === "ai" && ai.source === "none";

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-14">
      {/* progress dots */}
      <ol className="mb-6 flex items-center justify-center gap-2">
        {steps.map((s, i) => (
          <li key={s.key}>
            <button
              type="button"
              onClick={() => go(i)}
              disabled={i > step}
              aria-label={s.title}
              aria-current={i === step ? "step" : undefined}
              className={cn(
                "block rounded-full transition-all disabled:cursor-not-allowed",
                i === step
                  ? "h-3 w-8 bg-[var(--violet)]"
                  : i < step
                    ? "size-3 bg-[var(--violet)]/60"
                    : "size-3 bg-[var(--track)]",
              )}
            />
          </li>
        ))}
      </ol>

      <div className="sticker tint-violet overflow-hidden p-5 sm:p-8">
        {/* Momo header */}
        <div className="mb-5 flex items-center gap-3">
          <motion.div
            key={current.mood}
            initial={{ scale: 0.7, rotate: -12 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={SPRING.pop}
          >
            <Momo mood={current.mood} size={78} />
          </motion.div>
          <div className="min-w-0">
            <h1 className="text-xl leading-tight font-bold text-balance sm:text-2xl">
              {current.title} <span aria-hidden>{current.emoji}</span>
            </h1>
            <p className="mt-1 text-sm font-medium text-[var(--ink-soft)]">
              {current.blurb}
            </p>
          </div>
        </div>

        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={current.key}
            custom={direction}
            initial={{ opacity: 0, x: direction * 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -30 }}
            transition={{ duration: 0.28, ease: EASE.glide }}
            className="rounded-[1.75rem] bg-[var(--inset)] p-4 sm:p-5"
          >
            {step === 0 && (
              <div className="space-y-4">
                <Field label="What should I call you?" htmlFor="name" optional>
                  <Input
                    id="name"
                    value={draft.displayName}
                    onChange={(e) => set("displayName", e.target.value)}
                    placeholder="your name"
                    maxLength={60}
                  />
                </Field>
                <Field label="How old are you?" htmlFor="age">
                  <Input
                    id="age"
                    inputMode="numeric"
                    value={draft.age}
                    onChange={(e) => set("age", e.target.value)}
                    className="max-w-32"
                  />
                </Field>
                <Field label="For the energy maths" htmlFor="gender">
                  <Chips
                    options={[
                      { value: "male", label: "Male" },
                      { value: "female", label: "Female" },
                      { value: "other", label: "Rather not say" },
                    ]}
                    value={draft.gender}
                    onChange={(v) => set("gender", v as Gender)}
                  />
                  <p className="mt-2 text-xs font-medium text-[var(--ink-soft)]">
                    The BMR formula uses different constants per sex.
                    &ldquo;Rather not say&rdquo; averages the two.
                  </p>
                </Field>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <Field label="Units" htmlFor="units">
                  <Chips
                    options={[
                      { value: "metric", label: "kg / cm" },
                      { value: "imperial", label: "lb / ft" },
                    ]}
                    value={draft.units}
                    onChange={(v) => {
                      const next = v as UnitSystem;
                      setDraft((d) => {
                        const kg =
                          d.units === "metric"
                            ? numeric(d.weight)
                            : lbToKg(numeric(d.weight));
                        const targetKg =
                          d.units === "metric"
                            ? numeric(d.target)
                            : lbToKg(numeric(d.target));
                        const cm =
                          d.units === "metric"
                            ? d.heightCm
                            : inToCm(numeric(d.feet) * 12 + numeric(d.inches));
                        const totalIn = cmToIn(cm);
                        return {
                          ...d,
                          units: next,
                          weight: String(
                            round(next === "metric" ? kg : kgToLb(kg), 1),
                          ),
                          target: String(
                            round(next === "metric" ? targetKg : kgToLb(targetKg), 1),
                          ),
                          heightCm: round(cm, 1),
                          feet: String(Math.floor(totalIn / 12)),
                          inches: String(Math.round(totalIn % 12)),
                        };
                      });
                    }}
                  />
                </Field>

                {draft.units === "metric" ? (
                  <Field label="How tall are you?" htmlFor="height">
                    <div className="flex items-center gap-2">
                      <Input
                        id="height"
                        inputMode="decimal"
                        value={draft.heightCm}
                        onChange={(e) => set("heightCm", numeric(e.target.value))}
                        className="max-w-32"
                      />
                      <span className="font-bold text-[var(--ink-soft)]">cm</span>
                    </div>
                  </Field>
                ) : (
                  <Field label="How tall are you?" htmlFor="feet">
                    <div className="flex items-center gap-2">
                      <Input
                        id="feet"
                        inputMode="numeric"
                        value={draft.feet}
                        onChange={(e) => set("feet", e.target.value)}
                        className="max-w-20"
                      />
                      <span className="font-bold text-[var(--ink-soft)]">ft</span>
                      <Input
                        inputMode="numeric"
                        value={draft.inches}
                        onChange={(e) => set("inches", e.target.value)}
                        className="max-w-20"
                        aria-label="Inches"
                      />
                      <span className="font-bold text-[var(--ink-soft)]">in</span>
                    </div>
                  </Field>
                )}

                <Field label="And right now you weigh…" htmlFor="weight">
                  <div className="flex items-center gap-2">
                    <Input
                      id="weight"
                      inputMode="decimal"
                      value={draft.weight}
                      onChange={(e) => set("weight", e.target.value)}
                      className="numeral h-14 max-w-36 text-2xl"
                    />
                    <span className="font-bold text-[var(--ink-soft)]">{unit}</span>
                  </div>
                  <p className="mt-2 text-xs font-medium text-[var(--ink-soft)]">
                    This becomes your starting line — everything later is measured
                    from here.
                  </p>
                </Field>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <Field label="Goal weight" htmlFor="target">
                  <div className="flex items-center gap-2">
                    <Input
                      id="target"
                      inputMode="decimal"
                      value={draft.target}
                      onChange={(e) => set("target", e.target.value)}
                      className="numeral h-14 max-w-36 text-2xl"
                    />
                    <span className="font-bold text-[var(--ink-soft)]">{unit}</span>
                  </div>
                </Field>

                <Field label="How fast?" htmlFor="rate">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {RATES.map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => set("weeklyLossKg", rate)}
                        className={cn(
                          "rounded-2xl px-3 py-3 text-center transition-transform hover:-translate-y-0.5 active:scale-95",
                          draft.weeklyLossKg === rate
                            ? "bg-[var(--violet-solid)] text-white shadow-[0_3px_0_0_var(--primary-lip)]"
                            : "bg-[var(--muted)] text-[var(--ink-soft)]",
                        )}
                      >
                        <span className="numeral block text-base">
                          {draft.units === "metric"
                            ? `${rate} kg`
                            : `${round(kgToLb(rate), 1)} lb`}
                        </span>
                        <span className="text-[0.6rem] font-bold opacity-80">
                          per week
                        </span>
                      </button>
                    ))}
                  </div>
                  {draft.weeklyLossKg >= 1 ? (
                    <p className="mt-3 rounded-2xl bg-[var(--sun-soft)] px-3.5 py-2.5 text-xs font-semibold text-[var(--sun-text)]">
                      A kilo a week is a lot! It works for some people early on,
                      but it&rsquo;s harder to keep up. You can change this any
                      time.
                    </p>
                  ) : null}
                </Field>

                {currentWeightKg > 0 &&
                targetWeightKg > 0 &&
                targetWeightKg <= currentWeightKg ? (
                  <div className="rounded-2xl bg-[var(--mint-soft)] px-4 py-3 text-center">
                    <p className="label-cute">Distance to cover</p>
                    <p className="numeral mt-0.5 text-2xl text-[var(--mint)]">
                      {formatWeight(currentWeightKg - targetWeightKg, draft.units)}
                    </p>
                  </div>
                ) : null}
              </div>
            )}

            {current.key === "move" && (
              <div className="grid gap-2.5">
                {ACTIVITY_LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => set("activityLevel", level)}
                    className={cn(
                      "flex items-center justify-between gap-4 rounded-2xl px-4 py-3.5 text-left transition-transform hover:-translate-y-0.5 active:scale-[0.98]",
                      draft.activityLevel === level
                        ? "bg-[var(--violet-solid)] text-white shadow-[0_3px_0_0_var(--primary-lip)]"
                        : "bg-[var(--muted)]",
                    )}
                  >
                    <span>
                      <span className="block text-sm font-bold">
                        {ACTIVITY_COPY[level].label}
                      </span>
                      <span
                        className={cn(
                          "block text-xs font-medium",
                          draft.activityLevel === level
                            ? "text-white/85"
                            : "text-[var(--ink-soft)]",
                        )}
                      >
                        {ACTIVITY_COPY[level].detail}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "grid size-6 shrink-0 place-items-center rounded-full border-2",
                        draft.activityLevel === level
                          ? "border-white bg-[var(--inset)] text-[var(--violet)]"
                          : "border-[var(--border)]",
                      )}
                    >
                      {draft.activityLevel === level ? "✓" : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {current.key === "ai" && (
              <div className="space-y-4">
                <AiKeyForm initial={ai} onChange={setAi} />
                {ai.source === "none" ? (
                  <p className="rounded-2xl bg-[var(--sun-soft)] px-3.5 py-3 text-xs leading-relaxed font-semibold text-[var(--sun-text)]">
                    You can skip this. Without a key I guess from a built-in
                    food table — rougher numbers, and no photo logging. Add one
                    any time from the You tab.
                  </p>
                ) : null}
              </div>
            )}

            {current.key === "plan" && plan && (
              <div className="space-y-4">
                <div className="rounded-3xl bg-[var(--peach-soft)] px-5 py-4 text-center">
                  <p className="label-cute">Your daily energy</p>
                  <p className="numeral text-4xl text-[var(--peach)]">
                    {plan.targets.calories.toLocaleString()}
                  </p>
                  <p className="text-xs font-bold text-[var(--ink-soft)]">
                    kcal a day
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <Magnet
                    label="Protein"
                    emoji="💪"
                    value={`${plan.targets.protein}g`}
                    color="var(--mint)"
                  />
                  <Magnet
                    label="Carbs"
                    emoji="⚡"
                    value={`${plan.targets.carbs}g`}
                    color="var(--sky)"
                  />
                  <Magnet
                    label="Fat"
                    emoji="🥑"
                    value={`${plan.targets.fat}g`}
                    color="var(--sun)"
                  />
                  <Magnet
                    label="Fiber"
                    emoji="🌱"
                    value={`${plan.targets.fiber}g`}
                    color="var(--leaf)"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <Magnet label="BMR" value={plan.targets.bmr} hint="at rest" />
                  <Magnet label="Burn" value={plan.targets.tdee} hint="with moving" />
                  <Magnet
                    label="Journey"
                    value={
                      plan.journey.weeksLeft
                        ? `${Math.ceil(plan.journey.weeksLeft)} wks`
                        : "—"
                    }
                    hint={formatWeight(plan.journey.remainingKg, draft.units)}
                  />
                </div>

                {plan.targets.deficitClamped ? (
                  <p className="rounded-2xl bg-[var(--sun-soft)] px-3.5 py-3 text-xs font-semibold text-[var(--sun-text)]">
                    That pace would push you below a sensible floor, so I nudged
                    the target up to {plan.targets.calories.toLocaleString()} kcal
                    — about {achievableWeeklyLoss(plan.targets)} kg a week
                    instead.
                  </p>
                ) : null}

                <p className="text-xs leading-relaxed font-medium text-[var(--ink-soft)]">
                  These are estimates from population formulas, not medical
                  advice. Real bodies vary! I&rsquo;ll learn far more from your
                  actual weight trend than from any equation.
                </p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="mt-5 flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => go(step - 1)}
            disabled={step === 0 || pending}
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>

          {step < steps.length - 1 ? (
            <Button
              type="button"
              size="lg"
              variant={skippable ? "outline" : "default"}
              onClick={() => go(step + 1)}
            >
              {skippable ? "Skip for now" : "Next"}
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button
              type="button"
              size="lg"
              variant="mint"
              onClick={launch}
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <span aria-hidden>🚀</span>
              )}
              Let&rsquo;s go!
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  optional,
  children,
}: {
  label: string;
  htmlFor: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor} className="mb-2 block">
        {label}
        {optional ? (
          <span className="ml-1.5 text-xs font-medium text-[var(--ink-soft)]">
            optional
          </span>
        ) : null}
      </Label>
      {children}
    </div>
  );
}

function Chips({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={option.value === value}
          className={cn(
            "rounded-full px-4 py-2.5 text-sm font-bold transition-transform hover:-translate-y-0.5 active:scale-95",
            option.value === value
              ? "bg-[var(--violet-solid)] text-white shadow-[0_3px_0_0_var(--primary-lip)]"
              : "bg-[var(--muted)] text-[var(--ink-soft)]",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
