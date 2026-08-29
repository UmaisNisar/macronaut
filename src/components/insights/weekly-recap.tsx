"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { RefreshCw, Sparkles } from "lucide-react";

import type { AiPeriodReport, ReportPeriod } from "@/lib/schemas";
import { generateReportAction, peekReportAction } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Haptic } from "@/components/ui/haptic";
import { Momo } from "@/components/mascot/momo";
import { MomoSays } from "@/components/mascot/momo-says";
import { AnimatedNumber } from "@/components/viz/animated-number";
import { useCelebration } from "@/components/celebrate/celebration";
import { EASE, SPRING } from "@/lib/motion";

export type RecapStats = {
  daysLogged: number;
  totalDays: number;
  avgCalories: number;
  avgTarget: number;
  avgProtein: number;
  proteinDelta: number;
  calorieDelta: number;
  onTargetDays: number;
  weightDelta: number | null;
};

type Slide = {
  key: string;
  lead: string;
  big?: string;
  bigValue?: number;
  bigSuffix?: string;
  sub?: string;
  emoji: string;
  tint: string;
};

const GRADE = {
  A: { color: "var(--mint)", copy: "Clearly improving" },
  B: { color: "var(--sky)", copy: "Holding steady" },
  C: { color: "var(--sun)", copy: "Drifting a little" },
  D: { color: "var(--violet)", copy: "Not much data yet" },
} as const;

function buildSlides(stats: RecapStats, period: ReportPeriod): Slide[] {
  const days = period.replace("d", "");
  const slides: Slide[] = [
    {
      key: "intro",
      lead: "Your recap is ready…",
      emoji: "👀",
      tint: "tint-violet",
      sub: `The last ${days} days, all in one place.`,
    },
    {
      key: "logged",
      lead: "You logged food on",
      bigValue: stats.daysLogged,
      bigSuffix: ` of ${stats.totalDays} days`,
      emoji: "📖",
      tint: "tint-violet",
      sub:
        stats.daysLogged >= stats.totalDays * 0.8
          ? "That is genuinely consistent."
          : "Every logged day makes the picture sharper.",
    },
    {
      key: "protein",
      lead: "Protein averaged",
      bigValue: Math.round(stats.avgProtein),
      bigSuffix: "g a day",
      emoji: "💪",
      tint: "tint-mint",
      sub:
        stats.proteinDelta > 2
          ? `Up ${Math.round(stats.proteinDelta)}g on the period before 🎉`
          : stats.proteinDelta < -2
            ? `Down ${Math.abs(Math.round(stats.proteinDelta))}g — worth rebuilding.`
            : "Right about where it was before.",
    },
    {
      key: "band",
      lead: "You stayed in your calorie band",
      bigValue: stats.onTargetDays,
      bigSuffix: ` of ${stats.totalDays} days`,
      emoji: "🎯",
      tint: "tint-peach",
      sub: `Averaging ${stats.avgCalories.toLocaleString()} kcal against a ${stats.avgTarget.toLocaleString()} target.`,
    },
  ];

  if (stats.weightDelta !== null) {
    slides.push({
      key: "weight-tease",
      lead: "And the scale?",
      emoji: "🥁",
      tint: "tint-sun",
      sub: "Drumroll…",
    });
    slides.push({
      key: "weight",
      lead: stats.weightDelta < 0 ? "You're down" : stats.weightDelta > 0 ? "You're up" : "Dead level at",
      big: `${stats.weightDelta > 0 ? "+" : stats.weightDelta < 0 ? "−" : ""}${Math.abs(stats.weightDelta)} kg`,
      emoji: stats.weightDelta < 0 ? "🎉" : "📊",
      tint: stats.weightDelta < 0 ? "tint-mint" : "tint-sky",
      sub:
        stats.weightDelta < 0
          ? "Across this window. That is real."
          : "One window is noise — the long line is what counts.",
    });
  }

  return slides;
}

export function WeeklyRecap({
  period,
  stats,
}: {
  period: ReportPeriod;
  stats: RecapStats;
}) {
  const reduce = useReducedMotion();
  const { celebrate } = useCelebration();
  const [report, setReport] = useState<AiPeriodReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [stage, setStage] = useState<"idle" | "playing" | "done">("idle");
  const [slide, setSlide] = useState(0);
  const requested = useRef<string | null>(null);
  /** Whether the cheap lookup has come back yet. */
  const [checked, setChecked] = useState(false);

  const slides = buildSlides(stats, period);

  const run = (force: boolean) =>
    startTransition(async () => {
      const result = await generateReportAction(period, force);
      if (result.ok) {
        setReport(result.report);
        setError(null);
      } else {
        setError(result.error);
      }
    });

  /*
   * Opening Insights looks for a recap; it does not write one.
   *
   * This used to call generateReportAction on mount, which on the first visit
   * of a day meant a model call — several seconds of a serverless function,
   * and one of the day's ten reports spent on somebody who might only be
   * passing through. Navigating away during it was reported as taking four to
   * five seconds.
   *
   * The lookup is two reads and no model, so landing here is cheap. Writing
   * one is now something you ask for.
   */
  useEffect(() => {
    if (requested.current === period) return;
    requested.current = period;
    setReport(null);
    setError(null);
    setChecked(false);
    setStage("idle");
    setSlide(0);
    startTransition(async () => {
      const found = await peekReportAction(period);
      if (found.ok) setReport(found.report);
      setChecked(true);
    });
  }, [period]);

  const finish = useCallback(() => {
    setStage("done");
    if (stats.weightDelta !== null && stats.weightDelta < 0) {
      celebrate({
        title: `${Math.abs(stats.weightDelta)} kg down!`,
        detail: "Across this window. Look at you go.",
        emoji: "🎉",
        intensity: "big",
      });
    }
  }, [celebrate, stats.weightDelta]);

  /**
   * Next slide, or roll the credits if that was the last one. The check lives
   * outside the state updater — React may run updaters twice, and celebrating
   * twice would fire two bursts of confetti.
   */
  const advance = useCallback(() => {
    if (slide >= slides.length - 1) finish();
    else setSlide((s) => s + 1);
  }, [slide, slides.length, finish]);

  // Auto-advance the reveal.
  useEffect(() => {
    if (stage !== "playing") return;
    const id = setTimeout(advance, reduce ? 500 : 2300);
    return () => clearTimeout(id);
  }, [stage, slide, advance, reduce]);

  // Order matters. The "your recap is ready" card must not appear until we
  // actually have one — otherwise switching period flashes a promise that then
  // swaps to an error a moment later.
  if (pending && !report) {
    return (
      <div className="sticker tint-violet p-5 sm:p-6">
        <MomoSays mood="thinking" tone="violet" size={82} loading />
        <p className="label-cute mt-3 text-center">
          {checked
            ? `Reading back your last ${period.replace("d", "")} days…`
            : "One moment…"}
        </p>
      </div>
    );
  }

  if (!report) {
    // Nothing logged is a different situation from nothing written yet, and
    // the day count is the only thing that can tell them apart.
    const nothingLogged = stats.daysLogged === 0;
    return (
      <div className="sticker tint-violet p-5 sm:p-6">
        <MomoSays
          mood="curious"
          tone="violet"
          size={82}
          title={nothingLogged ? "Nothing to recap yet 🌱" : "Want your recap? ✨"}
        >
          {error ??
            (nothingLogged
              ? "Log a few days and I'll turn them into a proper little recap — wins, wobbles and a mission for next week."
              : `I'll read back your last ${period.replace("d", "")} days and write it up — wins, wobbles and a mission for next week.`)}
        </MomoSays>

        {!nothingLogged ? (
          <div className="mt-4 flex justify-center">
            <Haptic>
              <Button size="lg" onClick={() => run(false)} disabled={pending}>
                <Sparkles className="size-4" />
                {pending ? "Writing it" : "Write my recap"}
              </Button>
            </Haptic>
          </div>
        ) : null}
      </div>
    );
  }

  /* ---- the reveal ------------------------------------------------- */
  if (stage === "playing") {
    const s = slides[Math.min(slide, slides.length - 1)];
    return (
      <div
        className={`sticker ${s.tint} relative min-h-[320px] overflow-hidden p-6 sm:p-8`}
        onClick={advance}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && advance()}
      >
        {/* progress pips */}
        <div className="absolute inset-x-6 top-4 flex gap-1.5">
          {slides.map((_, i) => (
            <span
              key={i}
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--inset)]/70"
            >
              <motion.span
                className="block h-full bg-[var(--violet)]"
                initial={{ width: i < slide ? "100%" : "0%" }}
                animate={{ width: i <= slide ? "100%" : "0%" }}
                transition={{ duration: i === slide ? 2.3 : 0, ease: "linear" }}
              />
            </span>
          ))}
        </div>

        {/*
          popLayout instead of "wait": the outgoing slide leaves the layout flow
          so the incoming one can overlap it. With "wait" there was a visible
          blank card between every slide.
        */}
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={s.key}
            initial={{ opacity: 0, y: 24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.97, transition: { duration: 0.2 } }}
            transition={{ duration: 0.4, ease: EASE.squish }}
            className="flex min-h-[260px] flex-col items-center justify-center pt-6 text-center"
          >
            <motion.span
              className="text-5xl"
              initial={{ scale: 0, rotate: -25 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={SPRING.pop}
              aria-hidden
            >
              {s.emoji}
            </motion.span>
            <p className="mt-4 font-[family-name:var(--font-display)] text-lg font-semibold text-balance">
              {s.lead}
            </p>
            {s.bigValue !== undefined || s.big ? (
              <p className="numeral mt-1 text-5xl leading-none text-[var(--violet)] sm:text-6xl">
                {s.big ?? <AnimatedNumber value={s.bigValue!} />}
                {s.bigSuffix ? (
                  <span className="ml-1 text-xl text-[var(--ink-soft)]">
                    {s.bigSuffix}
                  </span>
                ) : null}
              </p>
            ) : null}
            {s.sub ? (
              <p className="mt-3 max-w-sm text-sm font-medium text-pretty text-[var(--ink-soft)]">
                {s.sub}
              </p>
            ) : null}
          </motion.div>
        </AnimatePresence>

        <p className="label-cute absolute inset-x-0 bottom-4 text-center text-[0.55rem]">
          tap to skip ahead
        </p>
      </div>
    );
  }

  /* ---- intro ------------------------------------------------------ */
  if (stage === "idle") {
    return (
      <div className="sticker tint-violet p-6 sm:p-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <motion.div
            animate={
              reduce ? { y: 0, rotate: 0 } : { y: [0, -10, 0], rotate: [-2, 2, -2] }
            }
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            <Momo mood="excited" size={110} />
          </motion.div>
          <div>
            <h2 className="text-xl font-bold sm:text-2xl">
              Your recap is ready… <span aria-hidden>👀</span>
            </h2>
            <p className="mt-1.5 text-sm font-medium text-[var(--ink-soft)]">
              The last {period.replace("d", "")} days, one slide at a time.
            </p>
          </div>
          <Button
            size="lg"
            onClick={() => {
              setSlide(0);
              setStage("playing");
            }}
          >
            <Sparkles className="size-4" />
            Open my recap
          </Button>
          <button
            type="button"
            onClick={() => setStage("done")}
            className="label-cute transition-colors hover:text-[var(--violet)]"
          >
            or just show me the summary
          </button>
        </div>
      </div>
    );
  }

  /* ---- the report -------------------------------------------------- */
  const grade = GRADE[report.grade];

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE.glide }}
      className="sticker tint-violet p-5 sm:p-6"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="label-cute">Momo&rsquo;s write-up</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSlide(0);
              setStage("playing");
            }}
            className="label-cute rounded-full bg-[var(--inset)] px-2.5 py-1.5 transition-transform hover:-translate-y-0.5"
          >
            ▶ replay
          </button>
          <button
            type="button"
            onClick={() => run(true)}
            disabled={pending}
            className="grid size-8 place-items-center rounded-full text-[var(--ink-soft)] transition-transform hover:-translate-y-0.5 hover:text-[var(--violet)] disabled:opacity-40"
            aria-label="Rewrite this recap"
          >
            <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} />
          </button>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <div
          className="flex size-16 shrink-0 flex-col items-center justify-center rounded-3xl bg-[var(--inset)]"
          style={{ boxShadow: `0 3px 0 0 color-mix(in oklab, ${grade.color} 34%, var(--card))` }}
          title={grade.copy}
        >
          <span className="numeral text-2xl leading-none" style={{ color: grade.color }}>
            {report.grade}
          </span>
          <span className="label-cute text-[0.45rem]">grade</span>
        </div>
        <h2 className="pt-1 text-xl font-bold text-balance sm:text-2xl">
          {report.title}
        </h2>
      </div>

      <p className="mt-3 text-sm leading-relaxed font-medium text-pretty text-[var(--ink-soft)]">
        {report.summary}
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <RecapList
          title="Biggest wins"
          emoji="🌟"
          items={report.wins}
          tint="var(--mint-soft)"
        />
        <RecapList
          title="What to nudge"
          emoji="🔧"
          items={report.improvements}
          tint="var(--peach-soft)"
        />
      </div>

      {report.mission ? (
        <div className="mt-4 flex items-start gap-3 rounded-3xl bg-[var(--inset)] px-4 py-3.5 shadow-[0_3px_0_0_var(--sun-soft)]">
          <span className="text-xl" aria-hidden>
            🎯
          </span>
          <div>
            <p className="label-cute" style={{ color: "var(--sun)" }}>
              Next mission
            </p>
            <p className="mt-0.5 text-sm font-semibold text-pretty">
              {report.mission}
            </p>
          </div>
        </div>
      ) : null}
    </motion.div>
  );
}

function RecapList({
  title,
  emoji,
  items,
  tint,
}: {
  title: string;
  emoji: string;
  items: string[];
  tint: string;
}) {
  if (!items.length) return null;
  return (
    <div className="rounded-3xl bg-[var(--inset)] p-4" style={{ boxShadow: `0 3px 0 0 ${tint}` }}>
      <p className="label-cute mb-2 flex items-center gap-1.5">
        <span aria-hidden>{emoji}</span>
        {title}
      </p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + i * 0.08 }}
            className="flex gap-2 text-sm font-medium text-pretty text-[var(--ink-soft)]"
          >
            <span aria-hidden>·</span>
            <span>{item}</span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
