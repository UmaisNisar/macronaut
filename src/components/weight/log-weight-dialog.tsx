"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Haptic } from "@/components/ui/haptic";
import { Input } from "@/components/ui/input";
import { StepperField } from "@/components/ui/stepper-field";
import { Label } from "@/components/ui/label";
import { Momo } from "@/components/mascot/momo";
import { MomoSays } from "@/components/mascot/momo-says";
import { useCelebration } from "@/components/celebrate/celebration";
import type { AiWeightNote, UnitSystem } from "@/lib/schemas";
import { kgToLb, lbToKg, round } from "@/lib/nutrition";
import type { Iso } from "@/lib/date";
import { ensureWeightCoachAction, logWeightAction } from "@/server/actions";
import { SPRING } from "@/lib/motion";

type Phase = "form" | "thinking" | "reaction";

export function LogWeightDialog({
  today,
  units,
  currentKg,
  trigger,
}: {
  today: Iso;
  units: UnitSystem;
  currentKg: number;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const { celebrate } = useCelebration();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("form");
  const [coach, setCoach] = useState<AiWeightNote | null>(null);
  const [pending, startTransition] = useTransition();

  const unit = units === "imperial" ? "lb" : "kg";
  const defaultValue = round(
    units === "imperial" ? kgToLb(currentKg) : currentKg,
    1,
  );

  // Seeded from the last weigh-in, which is what makes the nudge buttons
  // worth having: most days move this by a fraction of a kilo.
  const [weightValue, setWeightValue] = useState(String(defaultValue));

  function reset(nextOpen: boolean) {
    setOpen(nextOpen);
    // Seed on the way in, not at mount. The last weigh-in arrives as a prop
    // and changes after each save, and state seeded once would go on offering
    // a number the scale has already moved past.
    if (nextOpen) setWeightValue(String(defaultValue));
    if (!nextOpen) {
      setWeightValue(String(defaultValue));
      setTimeout(() => {
        setPhase("form");
        setCoach(null);
      }, 200);
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const entered = Number(form.get("weight"));
    if (!Number.isFinite(entered) || entered <= 0) {
      toast("That number looks a bit odd 🤔");
      return;
    }

    const weightKg = units === "imperial" ? lbToKg(entered) : entered;

    startTransition(async () => {
      const result = await logWeightAction({
        weightKg: round(weightKg, 2),
        date: String(form.get("date") || today),
        note: String(form.get("note") ?? "") || undefined,
      });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setPhase("thinking");
      router.refresh();

      /*
       * The action's answer, not the prop. `previousKg` is whatever the page
       * rendered with, and after the first weigh-in of a session it is a
       * reading older than the one you are actually beating — which is how
       * logging 119.7 twice announced a loss. The server knows the reading
       * immediately before this date; that is the only honest baseline.
       *
       * 0.05 kg of slack because weights round to two decimals and a scale
       * that reads 50g lighter has not moved.
       */
      const baselineKg = result.previousKg;
      const dropped =
        typeof baselineKg === "number" && weightKg < baselineKg - 0.05;

      for (const badge of result.unlocked) {
        celebrate({
          title: badge.name,
          detail: "Achievement unlocked!",
          emoji: badge.emoji,
          intensity: "big",
        });
      }
      if (dropped && !result.unlocked.length) {
        celebrate({
          title: "The scale moved! 🎉",
          detail: `Down ${round(baselineKg! - weightKg, 1)} ${unit} since your last reading.`,
          emoji: "📉",
        });
      }

      const reaction = await ensureWeightCoachAction(result.id);
      if (reaction.ok) {
        setCoach(reaction.coach);
        setPhase("reaction");
      } else {
        reset(false);
        toast("Weigh-in saved ⚖️");
      }
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger
        render={
          trigger ? (
            (trigger as React.ReactElement)
          ) : (
            <Button variant="outline">
              <span aria-hidden>⚖️</span>
              Weigh in
            </Button>
          )
        }
      />

      <DialogContent className="sm:max-w-md">
        <AnimatePresence mode="wait">
          {phase === "form" ? (
            <motion.form
              key="form"
              onSubmit={submit}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <DialogHeader>
                <DialogTitle className="text-xl">New weigh-in! ⚖️</DialogTitle>
                <DialogDescription className="font-medium text-[var(--ink-soft)]">
                  Daily, weekly, whenever. The line matters more than any single
                  number.
                </DialogDescription>
              </DialogHeader>

              <div className="mt-5 flex items-center gap-4">
                <motion.div
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 3, repeat: Infinity }}
                >
                  <Momo mood="curious" size={76} bare />
                </motion.div>

                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="weight">Today you are…</Label>
                  {/*
                    Nudge buttons matter most here. This is pre-filled with
                    your last weigh-in and is almost always within a kilo of
                    it, so opening a numeric keyboard to change one digit is
                    the slowest possible way to enter it.
                  */}
                  <StepperField
                    id="weight"
                    name="weight"
                    value={weightValue}
                    onChange={setWeightValue}
                    step={units === "imperial" ? 0.2 : 0.1}
                    min={20}
                    max={400}
                    suffix={unit}
                    autoFocus
                    inputClassName="h-14 max-w-[7rem] text-2xl"
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="date">When?</Label>
                  <Input
                    id="date"
                    name="date"
                    type="date"
                    defaultValue={today}
                    max={today}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="note">
                    Note
                    <span className="ml-1 text-xs font-medium text-[var(--ink-soft)]">
                      optional
                    </span>
                  </Label>
                  <Input
                    id="note"
                    name="note"
                    placeholder="after gym, salty dinner…"
                    maxLength={240}
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => reset(false)}>
                  Later
                </Button>
                <Haptic>
                  <Button type="submit" disabled={pending}>
                    {pending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : null}
                    Save it ✨
                  </Button>
                </Haptic>
              </div>
            </motion.form>
          ) : phase === "thinking" ? (
            <motion.div
              key="thinking"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <DialogHeader>
                <DialogTitle className="text-lg">Saved! 🎯</DialogTitle>
              </DialogHeader>
              <div className="mt-4">
                <MomoSays mood="thinking" tone="violet" size={80} loading />
              </div>
              <p className="label-cute mt-3 text-center">
                Momo is checking the bigger picture…
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="reaction"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={SPRING.pop}
            >
              <DialogHeader>
                <DialogTitle className="sr-only">Momo&rsquo;s reaction</DialogTitle>
              </DialogHeader>
              <MomoSays
                mood={coach?.tone === "celebrate" ? "celebrating" : "caring"}
                tone={coach?.tone === "celebrate" ? "mint" : "violet"}
                size={88}
                title={coach?.headline}
              >
                {coach?.message}
              </MomoSays>
              <div className="mt-5 flex justify-end">
                <Button onClick={() => reset(false)}>Thanks Momo 💕</Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
