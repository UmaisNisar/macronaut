"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StepperField } from "@/components/ui/stepper-field";
import { Label } from "@/components/ui/label";
import { Magnet, Squiggle } from "@/components/kit";
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
  GENDERS,
  type ActivityLevel,
  type Gender,
  type Profile,
  type UnitSystem,
} from "@/lib/schemas";
import { todayIso } from "@/lib/date";
import { updateGoalsAction } from "@/server/actions";
import { cn } from "@/lib/utils";

const RATES = [0.25, 0.5, 0.75, 1] as const;

const numeric = (v: string) => {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

export function GoalEditor({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [units, setUnits] = useState<UnitSystem>(profile.units);
  const [displayName, setDisplayName] = useState(profile.displayName ?? "");
  const [age, setAge] = useState(String(profile.age));
  const [gender, setGender] = useState<Gender>(profile.gender);
  const [heightCm, setHeightCm] = useState(profile.heightCm);
  const [feet, setFeet] = useState(String(Math.floor(cmToIn(profile.heightCm) / 12)));
  const [inches, setInches] = useState(
    String(Math.round(cmToIn(profile.heightCm) % 12)),
  );
  const [weight, setWeight] = useState(
    String(round(profile.units === "imperial" ? kgToLb(profile.currentWeightKg) : profile.currentWeightKg, 1)),
  );
  const [target, setTarget] = useState(
    String(round(profile.units === "imperial" ? kgToLb(profile.targetWeightKg) : profile.targetWeightKg, 1)),
  );
  const [weeklyLossKg, setWeeklyLossKg] = useState(profile.weeklyLossKg);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(
    profile.activityLevel,
  );

  const resolvedHeightCm =
    units === "metric"
      ? heightCm
      : inToCm(numeric(feet) * 12 + numeric(inches));
  const currentWeightKg =
    units === "metric" ? numeric(weight) : lbToKg(numeric(weight));
  const targetWeightKg =
    units === "metric" ? numeric(target) : lbToKg(numeric(target));

  const plan = useMemo(() => {
    if (currentWeightKg < 30 || resolvedHeightCm < 120) return null;
    const targets = computeTargets({
      age: clamp(Math.round(numeric(age)), 13, 100),
      gender,
      heightCm: resolvedHeightCm,
      weightKg: currentWeightKg,
      targetWeightKg: Math.min(targetWeightKg, currentWeightKg),
      weeklyLossKg,
      activityLevel,
    });
    return {
      targets,
      journey: computeJourney({
        startKg: profile.startingWeightKg,
        currentKg: currentWeightKg,
        targetKg: Math.min(targetWeightKg, currentWeightKg),
        weeklyLossKg: achievableWeeklyLoss(targets) || weeklyLossKg,
        fromIsoDate: todayIso(),
      }),
    };
  }, [
    activityLevel,
    age,
    currentWeightKg,
    gender,
    profile.startingWeightKg,
    resolvedHeightCm,
    targetWeightKg,
    weeklyLossKg,
  ]);

  function switchUnits(next: UnitSystem) {
    if (next === units) return;
    const kg = currentWeightKg;
    const targetKg = targetWeightKg;
    const totalIn = cmToIn(resolvedHeightCm);
    setUnits(next);
    setWeight(String(round(next === "metric" ? kg : kgToLb(kg), 1)));
    setTarget(String(round(next === "metric" ? targetKg : kgToLb(targetKg), 1)));
    setHeightCm(round(resolvedHeightCm, 1));
    setFeet(String(Math.floor(totalIn / 12)));
    setInches(String(Math.round(totalIn % 12)));
  }

  function save() {
    startTransition(async () => {
      const result = await updateGoalsAction({
        displayName: displayName.trim() || undefined,
        age: clamp(Math.round(numeric(age)), 13, 100),
        gender,
        heightCm: round(resolvedHeightCm, 1),
        currentWeightKg: round(currentWeightKg, 1),
        targetWeightKg: round(targetWeightKg, 1),
        weeklyLossKg,
        activityLevel,
        units,
      });

      if (!result.ok) {
        toast.error(result.error, {
          description: Object.values(result.fieldErrors ?? {})[0],
        });
        return;
      }

      toast.success("Flight plan updated", {
        description: "Past days keep the targets they were judged against.",
      });
      router.refresh();
    });
  }

  const unitLabel = units === "metric" ? "kg" : "lb";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="displayName">Name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Commander"
              maxLength={60}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="age">Age</Label>
            <Input
              id="age"
              inputMode="numeric"
              value={age}
              onChange={(e) => setAge(e.target.value)}
            />
          </div>
        </div>

        <Group label="Units">
          <Chips
            options={[
              { value: "metric", label: "Metric" },
              { value: "imperial", label: "Imperial" },
            ]}
            value={units}
            onChange={(v) => switchUnits(v as UnitSystem)}
          />
        </Group>

        <Group label="Sex used for BMR">
          <Chips
            options={GENDERS.map((g) => ({
              value: g,
              label: g === "other" ? "Prefer not to say" : g === "male" ? "Male" : "Female",
            }))}
            value={gender}
            onChange={(v) => setGender(v as Gender)}
          />
        </Group>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="height">Height</Label>
            {units === "metric" ? (
              <div className="flex items-center gap-2">
                <Input
                  id="height"
                  inputMode="decimal"
                  value={heightCm}
                  onChange={(e) => setHeightCm(numeric(e.target.value))}
                />
                <span className="label-cute">cm</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <Input
                  id="height"
                  inputMode="numeric"
                  value={feet}
                  onChange={(e) => setFeet(e.target.value)}
                />
                <span className="label-cute">ft</span>
                <Input
                  inputMode="numeric"
                  value={inches}
                  onChange={(e) => setInches(e.target.value)}
                  aria-label="Inches"
                />
                <span className="label-cute">in</span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="weight">Current weight</Label>
            <div className="flex items-center gap-2">
              <Input
                id="weight"
                inputMode="decimal"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
              <span className="label-cute">{unitLabel}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="target">Target weight</Label>
            {/* Set once and rarely revisited, so typing stays the fast path;
                the nudges are for small corrections. */}
            <StepperField
              id="target"
              value={target}
              onChange={setTarget}
              step={units === "imperial" ? 1 : 0.5}
              min={30}
              max={400}
              suffix={unitLabel}
            />
          </div>
        </div>

        <Group label="Pace">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {RATES.map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => setWeeklyLossKg(rate)}
                className={cn(
                  "rounded-3xl bg-[var(--inset)] px-3 py-2.5 text-left transition-transform hover:-translate-y-0.5",
                  weeklyLossKg === rate
                    ? "ring-2 ring-[var(--violet)] ring-offset-2"
                    : "",
                )}
              >
                <span className="numeral block text-sm font-semibold">
                  {units === "metric" ? `${rate} kg` : `${round(kgToLb(rate), 1)} lb`}
                </span>
                <span className="label-cute mt-0.5 block text-[0.52rem]">per week</span>
              </button>
            ))}
          </div>
        </Group>

        <Group label="Activity level">
          <div className="grid gap-2">
            {ACTIVITY_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setActivityLevel(level)}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-3xl bg-[var(--inset)] px-3.5 py-2.5 text-left transition-transform hover:-translate-y-0.5",
                  activityLevel === level
                    ? "ring-2 ring-[var(--violet)] ring-offset-2"
                    : "",
                )}
              >
                <span>
                  <span className="block text-sm font-medium">
                    {ACTIVITY_COPY[level].label}
                  </span>
                  <span className="block text-xs text-[var(--ink-soft)]">
                    {ACTIVITY_COPY[level].detail}
                  </span>
                </span>
                <span
                  className={cn(
                    "size-3.5 shrink-0 rounded-full border-2",
                    activityLevel === level
                      ? "border-[var(--violet)] bg-[var(--violet)]"
                      : "border-[var(--border)]",
                  )}
                />
              </button>
            ))}
          </div>
        </Group>

        <Button onClick={save} disabled={pending} size="lg">
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Save flight plan
        </Button>
      </div>

      {/* Live preview */}
      <div className="sticker tint-violet space-y-2.5 p-4 lg:sticky lg:top-6">
        <p className="label-cute">Recalculated plan</p>

        {plan ? (
          <>
            <Magnet
              label="Daily calories"
              value={plan.targets.calories.toLocaleString()}
              color="var(--peach)" emoji="🔥"
              hint={`${plan.targets.deficit} kcal deficit`}
            />
            <div className="grid grid-cols-2 gap-2.5">
              <Magnet label="Protein" value={`${plan.targets.protein}g`} color="var(--mint)" emoji="💪" />
              <Magnet label="Carbs" value={`${plan.targets.carbs}g`} color="var(--sky)" emoji="⚡" />
              <Magnet label="Fat" value={`${plan.targets.fat}g`} color="var(--sun)" emoji="🥑" />
              <Magnet label="Fiber" value={`${plan.targets.fiber}g`} color="var(--leaf)" emoji="🌱" />
            </div>

            <Squiggle className="my-3" />

            <div className="grid grid-cols-2 gap-2.5">
              <Magnet label="BMR" value={plan.targets.bmr.toLocaleString()} />
              <Magnet label="TDEE" value={plan.targets.tdee.toLocaleString()} />
            </div>

            <Magnet
              label="Estimated journey"
              value={
                plan.journey.reachedGoal
                  ? "Target reached"
                  : plan.journey.weeksLeft
                    ? `${Math.ceil(plan.journey.weeksLeft)} weeks`
                    : "—"
              }
              hint={`${formatWeight(plan.journey.remainingKg, units)} remaining`}
            />

            {plan.targets.deficitClamped ? (
              <p className="text-xs leading-relaxed font-semibold text-[var(--peach-text)]">
                That pace would take intake below a sensible floor, so the target
                has been lifted. Real pace: about{" "}
                {achievableWeeklyLoss(plan.targets)} kg a week.
              </p>
            ) : null}

            <p className="text-xs leading-relaxed text-[var(--ink-soft)]">
              Changing goals writes a new plan from today. Days already logged
              keep the targets they were scored against.
            </p>
          </>
        ) : (
          <p className="text-sm text-[var(--ink-soft)]">
            Fill in height and weight to see the recalculated plan.
          </p>
        )}
      </div>
    </div>
  );
}

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{label}</p>
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
  onChange: (v: string) => void;
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
            "rounded-full px-3.5 py-2 text-sm font-bold transition-transform hover:-translate-y-0.5 active:scale-95",
            option.value === value
              ? "bg-[var(--violet)] text-white shadow-[0_3px_0_0_var(--primary-lip)]"
              : "bg-[var(--inset)] text-[var(--ink-soft)] shadow-[0_3px_0_0_var(--lip)]",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
