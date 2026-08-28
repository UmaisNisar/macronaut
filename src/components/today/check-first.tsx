"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";

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
import { Momo } from "@/components/mascot/momo";
import { checkFoodAction, logCheckedFoodAction } from "@/server/actions";
import { useUndoToast } from "@/components/today/undo";
import type { Iso } from "@/lib/date";
import { SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * "Can I have this?"
 *
 * Until now the app could only talk about food once it had been eaten, which
 * is the wrong way round for the question people actually have while standing
 * in front of it. This prices something up and says whether it fits, and
 * writes nothing unless you say so.
 *
 * Deliberately its own surface rather than a mode on the composer. The
 * composer has a camera and a barcode scanner beside it, and a mode that
 * quietly changed what those did — check, or log? — is exactly the sort of
 * thing that logs a meal you were only thinking about.
 */

type Result = Awaited<ReturnType<typeof checkFoodAction>>;
type Payload = Extract<Result, { ok: true }>;

const TONE = {
  good: { tint: "tint-mint", color: "var(--mint)", emoji: "👍", mood: "excited" },
  tight: { tint: "tint-sun", color: "var(--sun)", emoji: "🤏", mood: "thinking" },
  over: { tint: "tint-peach", color: "var(--peach)", emoji: "🫣", mood: "caring" },
} as const;

export function CheckFirst({ date }: { date: Iso }) {
  const router = useRouter();
  const offerUndo = useUndoToast();

  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [result, setResult] = useState<Payload | null>(null);
  const [pending, startTransition] = useTransition();
  const [logging, startLogging] = useTransition();

  function reset(next: boolean) {
    setOpen(next);
    if (!next) {
      // After the close animation, so the card does not blink away first.
      setTimeout(() => {
        setText("");
        setResult(null);
      }, 200);
    }
  }

  function check() {
    const value = text.trim();
    if (value.length < 2) {
      toast("What are you thinking of?");
      return;
    }
    setResult(null);
    startTransition(async () => {
      const r = await checkFoodAction({ text: value, date });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setResult(r);
    });
  }

  function logIt() {
    if (!result) return;
    startLogging(async () => {
      const r = await logCheckedFoodAction({ date, items: result.items });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      reset(false);
      // The same offer as anywhere else a log happens, because deciding to eat
      // it and then changing your mind is the whole spirit of this screen.
      offerUndo(r.added, date);
      router.refresh();
    });
  }

  const tone = result ? TONE[result.verdict.tone] : null;

  return (
    <Dialog open={open} onOpenChange={reset}>
      {/* The element goes straight to `render`. Wrapping it in Haptic ate
          the trigger's own props and the dialog simply never opened. */}
      <DialogTrigger
        render={
          <button
            type="button"
            className="tappable inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--inset)] px-3 py-1.5 text-xs font-bold text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]"
          >
            <Search className="size-3.5" />
            Check first
          </button>
        }
      />

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Thinking about something? 🔍</DialogTitle>
          <DialogDescription>
            I will price it up and tell you whether it fits. Nothing gets
            logged unless you say so.
          </DialogDescription>
        </DialogHeader>

        <div className="field rounded-3xl bg-[var(--inset)] p-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                check();
              }
            }}
            rows={2}
            autoFocus
            disabled={pending}
            placeholder="a large flat white and a chocolate croissant…"
            aria-label="What are you thinking of eating?"
            className="w-full resize-none bg-transparent text-base leading-relaxed font-medium outline-none placeholder:text-[var(--ink-soft)]/60 disabled:opacity-60"
          />
        </div>

        <Haptic>
          <Button onClick={check} disabled={pending} size="lg" className="w-full">
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Working it out
              </>
            ) : (
              <>
                <Search className="size-4" />
                Check it
              </>
            )}
          </Button>
        </Haptic>

        <AnimatePresence mode="wait">
          {result && tone ? (
            <motion.div
              key={result.verdict.headline + result.verdict.after.calories}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={SPRING.pop}
              className={cn("sticker mt-1 p-4", tone.tint)}
            >
              <div className="flex items-start gap-3">
                <span className="shrink-0">
                  <Momo mood={tone.mood} size={46} bare />
                </span>

                <div className="min-w-0 flex-1">
                  <p
                    className="font-[family-name:var(--font-display)] text-lg leading-tight font-bold"
                    style={{ color: tone.color }}
                  >
                    {tone.emoji} {result.verdict.headline}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed font-medium">
                    {result.verdict.detail}
                  </p>

                  {result.verdict.notes.map((note) => (
                    <p
                      key={note}
                      className="mt-1.5 text-xs leading-relaxed font-medium text-[var(--ink-soft)]"
                    >
                      {note}
                    </p>
                  ))}
                </div>
              </div>

              {/* What it actually is, so the verdict can be checked rather than
                  taken on faith. */}
              <ul className="mt-3 space-y-1.5">
                {result.items.map((item, i) => (
                  <li
                    key={`${item.name}-${i}`}
                    className="flex items-center gap-2 rounded-2xl bg-[var(--inset)] px-3 py-2"
                  >
                    <span className="text-base leading-none" aria-hidden>
                      {item.emoji}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-bold">
                      {item.name}
                      <span className="ml-1.5 text-xs font-medium text-[var(--ink-soft)]">
                        {item.quantity}
                      </span>
                    </span>
                    <span className="numeral shrink-0 text-sm">
                      {Math.round(item.calories)}
                    </span>
                  </li>
                ))}
              </ul>

              <p className="mt-2.5 text-xs font-semibold text-[var(--ink-soft)]">
                Today would be{" "}
                <span className="numeral text-[var(--ink)]">
                  {result.verdict.after.calories.toLocaleString()}
                </span>{" "}
                of {result.day.target.toLocaleString()} kcal
                {result.source === "estimator"
                  ? " · guessed offline, so treat it as a ballpark"
                  : ""}
              </p>

              {result.portion ? (
                <p className="mt-2 rounded-2xl bg-[var(--inset)] px-3 py-2 text-xs leading-relaxed font-medium text-[var(--ink-soft)]">
                  {result.portion.fraction === 0.5 ? "Half" : "Three quarters"}{" "}
                  of it would be about{" "}
                  <span className="numeral text-[var(--ink)]">
                    {result.portion.calories}
                  </span>{" "}
                  kcal, which does fit.
                </p>
              ) : null}

              <div className="mt-3 flex gap-2">
                <Haptic className="flex-1">
                  <Button
                    onClick={logIt}
                    disabled={logging}
                    className="w-full"
                    variant={result.verdict.tone === "over" ? "outline" : "default"}
                  >
                    {logging ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : null}
                    {logging ? "Adding" : "I ate it — log it"}
                  </Button>
                </Haptic>
                <Haptic>
                  <Button variant="ghost" onClick={() => reset(false)}>
                    Not now
                  </Button>
                </Haptic>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
