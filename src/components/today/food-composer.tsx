"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { Camera, Search, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Haptic } from "@/components/ui/haptic";
import { BarcodeScanner } from "@/components/today/barcode-scanner";
import { Momo } from "@/components/mascot/momo";
import { AnimatedNumber } from "@/components/viz/animated-number";
import { logFoodAction, logFoodPhotoAction } from "@/server/actions";
import { isOffline, queueLog } from "@/lib/offline-queue";
import { useCelebration } from "@/components/celebrate/celebration";
import { CheckFirst } from "@/components/today/check-first";
import { useUndoLog } from "@/components/today/undo";
import type { FoodEntry } from "@/lib/schemas";
import type { Iso } from "@/lib/date";
import { EASE, SPRING } from "@/lib/motion";

const EXAMPLES = [
  "scrambled eggs on toast, then a chicken caesar salad…",
  "cheeseburger, medium fries and a diet coke",
  "grilled chicken with sweet potato and broccoli",
  "protein shake, banana and a handful of almonds",
  "porridge with berries, then spaghetti bolognese",
];

const WORKING = [
  { icon: "🔍", text: "Investigating your meal…" },
  { icon: "🧠", text: "Doing some food math…" },
  { icon: "🍕", text: "Calculating deliciousness…" },
  { icon: "👀", text: "Double-checking that snack…" },
  { icon: "📊", text: "Asking the nutrition brain…" },
];

const FLOATERS = ["🥚", "🍞", "🍗", "🍚", "🥑", "🍓", "🧀", "🥦"];

/** Momo's reaction to what just landed. Local, instant, no extra model call. */
function reactTo(entries: FoodEntry[]) {
  const kcal = entries.reduce((a, e) => a + e.calories, 0);
  const protein = entries.reduce((a, e) => a + e.protein, 0);
  if (protein >= 40) return "Okayyy, that protein is looking GOOD 👀";
  if (entries.length >= 4)
    return "Ooh, a proper spread. Logged every bit of it!";
  if (kcal < 250)
    return "Noted! Light one — I'll keep an eye on the running total.";
  return "Got it all down. Nice one 💪";
}

export function FoodComposer({
  date,
  isToday,
  isFirstEver,
}: {
  date: Iso;
  isToday: boolean;
  isFirstEver?: boolean;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const { celebrate } = useCelebration();

  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(0);
  const [placeholder, setPlaceholder] = useState(EXAMPLES[0]);
  const [reveal, setReveal] = useState<FoodEntry[] | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pending || text) return;
    const id = setInterval(
      () =>
        setPlaceholder(EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)]),
      5000,
    );
    return () => clearInterval(id);
  }, [pending, text]);

  useEffect(() => {
    if (!pending) return;
    const id = setInterval(
      () => setStep((i) => (i + 1) % WORKING.length),
      1500,
    );
    return () => clearInterval(id);
  }, [pending]);

  function grow() {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  function submit() {
    const value = text.trim();
    if (value.length < 2) {
      toast("Tell me what you ate first 🥺");
      return;
    }
    setStep(0);
    setReveal(null);

    startTransition(async () => {
      // No signal: keep the meal on the device rather than losing it to a
      // failed request. The outbox sends it the moment we are back.
      if (isOffline()) {
        const queued = await queueLog({ kind: "text", text: value, date });
        if (queued) {
          setText("");
          requestAnimationFrame(grow);
          window.dispatchEvent(new Event("macronaut:queued"));
          toast("Saved offline 📥", {
            description: "It will send itself when you have signal.",
          });
          return;
        }
      }
      applyResult(await logFoodAction({ text: value, date }));
    });
  }

  const dismissReveal = useCallback(() => setReveal(null), []);

  /** Shared by both inputs: typing a meal and photographing one land here. */
  function applyResult(result: Awaited<ReturnType<typeof logFoodAction>>) {
    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    setText("");
    requestAnimationFrame(grow);
    setReveal(result.added);
    router.refresh();

    if (result.keyIssue === "refused") {
      toast.error("Google refused your Gemini key", {
        description: "Guessed this one instead. Check the key in You.",
      });
    } else if (result.source === "estimator" && result.keyIssue !== "missing") {
      // No key is already explained by the card above the composer; a toast
      // on every single log would just be nagging.
      toast("Guessed this one offline", {
        description: "Tap any item to fix the numbers.",
      });
    }

    for (const badge of result.unlocked) {
      celebrate({
        title: badge.name,
        detail: "Achievement unlocked!",
        emoji: badge.emoji,
        intensity: "big",
      });
    }

    if (isFirstEver && !result.unlocked.length) {
      celebrate({
        title: "First meal logged!",
        detail: "This is where it starts 🎉",
        emoji: "🎉",
        intensity: "big",
      });
    }
  }

  /**
   * Shrink before sending. A modern phone camera produces a multi-megabyte
   * file, that whole payload would cross the wire on a mobile connection, and
   * a plate of food is perfectly legible at 1024px. Whatever the camera hands
   * us — HEIC included — comes out the other side as JPEG.
   */
  async function downscale(
    file: File,
  ): Promise<{ data: string; mime: string }> {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas
      .getContext("2d")
      ?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const url = canvas.toDataURL("image/jpeg", 0.72);
    return { data: url.slice(url.indexOf(",") + 1), mime: "image/jpeg" };
  }

  function submitPhoto(file: File) {
    setStep(0);
    setReveal(null);
    startTransition(async () => {
      let shot: { data: string; mime: string };
      try {
        shot = await downscale(file);
      } catch {
        toast.error("That image could not be opened.");
        return;
      }
      // Anything already typed rides along as a hint — "the sauce is
      // mayo" is exactly what a photo cannot tell the model.
      const note = text.trim() || undefined;

      if (isOffline()) {
        const queued = await queueLog({
          kind: "photo",
          imageBase64: shot.data,
          mimeType: shot.mime,
          date,
          note,
        });
        if (queued) {
          setText("");
          window.dispatchEvent(new Event("macronaut:queued"));
          toast("Photo saved offline 📥", {
            description: "Momo will read it once you are back online.",
          });
          return;
        }
      }

      applyResult(
        await logFoodPhotoAction({
          imageBase64: shot.data,
          mimeType: shot.mime,
          date,
          note,
        }),
      );
    });
  }

  const mood = pending ? "thinking" : text.length > 0 ? "curious" : "idle";

  return (
    <div className="relative">
      <div className="sticker tint-violet relative overflow-hidden p-4 sm:p-5">
        {/* food drifting past while Momo thinks */}
        <AnimatePresence>
          {pending && !reduce
            ? FLOATERS.map((f, i) => (
                <motion.span
                  key={f}
                  className="pointer-events-none absolute text-xl"
                  style={{ left: `${8 + i * 11}%`, bottom: 0 }}
                  initial={{ y: 20, opacity: 0, rotate: 0 }}
                  animate={{ y: -150, opacity: [0, 0.9, 0], rotate: 40 }}
                  exit={{ opacity: 0 }}
                  transition={{
                    duration: 2.6,
                    repeat: Infinity,
                    delay: i * 0.28,
                    ease: "easeOut",
                  }}
                >
                  {f}
                </motion.span>
              ))
            : null}
        </AnimatePresence>

        <div className="relative flex items-end gap-2 sm:gap-3">
          <motion.div
            className="shrink-0"
            animate={{ rotate: pending ? [-3, 3, -3] : 0 }}
            transition={{ duration: 1.4, repeat: Infinity }}
          >
            <span className="block sm:hidden">
              <Momo mood={mood} size={58} bare />
            </span>
            <span className="hidden sm:block">
              <Momo mood={mood} size={80} />
            </span>
          </motion.div>

          <div className="min-w-0 flex-1">
            {/*
              The question this box answers is "what did I eat". The other
              question — "can I have this" — sits beside it rather than
              inside it, because the scanner and camera below would otherwise
              have two meanings and one of them logs your dinner.
            */}
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label
                htmlFor="food-input"
                className="min-w-0 font-[family-name:var(--font-display)] text-base font-semibold sm:text-lg"
              >
                {isToday
                  ? "Tell me what you ate 🍜"
                  : "Add something to this day 🍜"}
              </label>

              {isToday ? <CheckFirst date={date} /> : null}
            </div>

            <div className="field rounded-3xl bg-[var(--inset)] p-3 shadow-[inset_0_2px_6px_rgb(123_97_255_/_0.10)]">
              <textarea
                id="food-input"
                ref={area}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  grow();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    submit();
                  }
                }}
                rows={2}
                disabled={pending}
                placeholder={placeholder}
                aria-label="Describe what you ate"
                className="w-full resize-none bg-transparent text-[1rem] leading-relaxed font-medium outline-none placeholder:text-[var(--ink-soft)]/60 disabled:opacity-60"
              />
            </div>
          </div>
        </div>

        <div className="relative mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="min-h-[1.5rem] flex-1">
            <AnimatePresence mode="wait">
              {pending ? (
                <motion.p
                  key={step}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  className="flex items-center gap-2 text-sm font-semibold text-[var(--violet)]"
                >
                  <span aria-hidden>{WORKING[step].icon}</span>
                  {WORKING[step].text}
                </motion.p>
              ) : (
                <motion.p
                  key="hint"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-xs font-medium text-[var(--ink-soft)]"
                >
                  Plain English is fine — Momo works out the portions.
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            // On a phone this opens the camera straight away rather than the
            // photo library, which is what you want mid-meal.
            capture="environment"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Reset first, or picking the same photo twice fires nothing.
              event.target.value = "";
              if (file) submitPhoto(file);
            }}
          />

          {/* The parent stacks on mobile, so the two actions get their own row
              or the camera drops beneath the primary button as a stray. */}
          {/*
            Three labelled buttons do not fit one phone row. They used to try:
            the two outline buttons held their width, the primary took what was
            left — 72px — and since buttons never wrap their text, "Let Momo
            look" spilled straight out of its own pill.

            So on a phone the secondary actions get their own row and the
            primary gets a full-width one beneath. Everything keeps its label,
            nothing is squashed. From `sm` up there is room for a single row.
          */}
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <div className="flex items-center gap-2 sm:contents">
              {isToday ? <BarcodeScanner date={date} /> : null}

              <Haptic className="min-w-0 flex-1 sm:flex-none">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={pending}
                  onClick={() => fileInput.current?.click()}
                  aria-label="Log a meal from a photo"
                  title="Snap your plate"
                >
                  <Camera className="size-4" />
                  <span className="sm:hidden">Photo</span>
                </Button>
              </Haptic>
            </div>

            <Haptic className="w-full sm:w-auto">
              <Button
                onClick={submit}
                disabled={pending}
                size="lg"
                className="w-full"
              >
                {pending ? (
                  <motion.span
                    animate={{ rotate: [0, 20, -20, 0] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  >
                    <Search className="size-4" />
                  </motion.span>
                ) : (
                  <Sparkles className="size-4" />
                )}
                {pending ? "Investigating" : "Let Momo look 🔍"}
              </Button>
            </Haptic>
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {reveal ? (
          <RevealCard
            // A fresh card per log, so the phases replay for new food and
            // never for a re-render of the same food.
            key={reveal.map((e) => e.id).join("|")}
            entries={reveal}
            date={date}
            onDone={dismissReveal}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** The payoff: each food pops in, then the totals count up, then Momo reacts. */
function RevealCard({
  entries,
  date,
  onDone,
}: {
  entries: FoodEntry[];
  date: Iso;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<"items" | "totals" | "momo">("items");
  const { undo, undoing } = useUndoLog();

  const kcal = entries.reduce((a, e) => a + e.calories, 0);
  const protein = entries.reduce((a, e) => a + e.protein, 0);

  /*
   * Runs once per reveal, and deliberately does not depend on `onDone`.
   *
   * It used to. `onDone` is an inline arrow recreated on every render of the
   * composer, and the composer re-renders whenever the page refreshes — which
   * it does after every log, and again when the coach note arrives. So the
   * effect tore down and restarted all three timers each time, replaying the
   * card through items -> totals -> Momo over and over. Each phase is a
   * different height, so the page jumped on every replay: the "keeps appearing
   * and going away" that made scrolling feel possessed.
   */
  useEffect(() => {
    const step = 170 * entries.length;
    const t1 = setTimeout(() => setPhase("totals"), 250 + step);
    const t2 = setTimeout(() => setPhase("momo"), 900 + step);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.25 } }}
      transition={{ duration: 0.3, ease: EASE.squish }}
      className="sticker tint-mint mt-3 p-4 sm:p-5"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="label-cute">Found it 🎉</p>

        <div className="flex items-center gap-1">
          {/*
            Undo belongs here rather than in a toast. This card is the app
            saying what it logged, so it is the moment you notice it read the
            meal wrong — and it is already on screen, already pointing at the
            thing that would be removed.
          */}
          <button
            type="button"
            disabled={undoing}
            onClick={() => {
              void undo(entries, date).then((done) => {
                if (done) onDone();
              });
            }}
            className="tappable rounded-full bg-[var(--inset)] px-3 py-1.5 text-xs font-bold text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)] disabled:opacity-50"
          >
            {undoing ? "Undoing…" : "Undo"}
          </button>

          {/*
            Dismissing is now a choice rather than something that happens under
            you. The card used to remove itself on a timer, which pulled four
            hundred pixels out of the page while you were reading the list below.
          */}
          <button
            type="button"
            onClick={onDone}
            aria-label="Dismiss"
            className="-m-1 grid size-8 place-items-center rounded-full p-1 text-[var(--ink-soft)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--ink)]"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <ul className="flex flex-wrap gap-2">
        {entries.map((entry, i) => (
          <motion.li
            key={entry.id}
            initial={{ scale: 0, rotate: -12, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ ...SPRING.pop, delay: 0.15 + i * 0.17 }}
            className="flex items-center gap-2 rounded-full bg-[var(--inset)] py-1.5 pr-3.5 pl-2 shadow-[0_2px_0_0_var(--mint-soft)]"
          >
            <span className="text-lg" aria-hidden>
              {entry.emoji}
            </span>
            <span className="text-sm font-bold">{entry.name}</span>
            <span className="numeral text-xs text-[var(--peach)]">
              {Math.round(entry.calories)}
            </span>
          </motion.li>
        ))}
      </ul>

      <AnimatePresence>
        {phase !== "items" ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 flex gap-3"
          >
            <div className="flex-1 rounded-2xl bg-[var(--peach-soft)] px-3.5 py-2.5">
              <p className="label-cute text-[0.55rem]">🔥 Energy</p>
              <p className="numeral text-xl text-[var(--peach)]">
                +<AnimatedNumber value={Math.round(kcal)} />
              </p>
            </div>
            <div className="flex-1 rounded-2xl bg-[var(--mint-soft)] px-3.5 py-2.5">
              <p className="label-cute text-[0.55rem]">💪 Protein</p>
              <p className="numeral text-xl text-[var(--mint)]">
                +<AnimatedNumber value={Math.round(protein)} />g
              </p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {phase === "momo" ? (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="mt-4 flex items-center gap-2.5"
          >
            <Momo mood="excited" size={52} bare />
            <p className="bubble bubble-left tint-mint px-3.5 py-2 text-sm font-semibold">
              {reactTo(entries)}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
