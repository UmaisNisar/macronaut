import "server-only";

import {
  AiCoachNote,
  AiPeriodReport,
  AiWeightNote,
  type DailyLog,
  type Macros,
  type ReportPeriod,
  type Targets,
} from "@/lib/schemas";
import { generateJson } from "@/lib/ai/gemini";
import {
  COACH_SCHEMA,
  DAILY_COACH_SYSTEM,
  REPORT_SCHEMA,
  REPORT_SYSTEM,
  WEIGHT_COACH_SYSTEM,
  WEIGHT_SCHEMA,
} from "@/lib/ai/prompts";
import { isGeminiConfigured } from "@/lib/env";
import { round } from "@/lib/nutrition";
import type { PeriodStats } from "@/lib/insights";

export type Sourced<T> = { note: T; source: "ai" | "template" };

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

/* ================================================================== */
/* Daily coach                                                         */
/* ================================================================== */

export type DailyCoachContext = {
  dateLabel: string;
  totals: Macros;
  targets: Targets;
  entryNames: string[];
  score: number;
  recentDays: { label: string; calories: number; target: number; protein: number }[];
  streakDays: number;
  weightNoteKg: number | null;
  targetWeightKg: number;
  weeklyLossKg: number;
};

function dailyPrompt(c: DailyCoachContext): string {
  const recent = c.recentDays.length
    ? c.recentDays
        .map(
          (d) =>
            `- ${d.label}: ${Math.round(d.calories)} kcal (target ${Math.round(d.target)}), ${Math.round(d.protein)} g protein`,
        )
        .join("\n")
    : "- no earlier days logged yet";

  return `TODAY (${c.dateLabel})
Calories: ${Math.round(c.totals.calories)} of ${c.targets.calories} target (${pct(c.totals.calories, c.targets.calories)}%)
Protein: ${Math.round(c.totals.protein)} g of ${c.targets.protein} g (${pct(c.totals.protein, c.targets.protein)}%)
Carbs: ${Math.round(c.totals.carbs)} g of ${c.targets.carbs} g
Fat: ${Math.round(c.totals.fat)} g of ${c.targets.fat} g
Fiber: ${Math.round(c.totals.fiber)} g of ${c.targets.fiber} g
Daily score: ${c.score}/100
Foods logged: ${c.entryNames.slice(0, 12).join(", ") || "none"}

RECENT DAYS (most recent first)
${recent}

CONTEXT
Logging streak: ${c.streakDays} day(s)
Current weight: ${c.weightNoteKg ? `${c.weightNoteKg} kg` : "not logged recently"}
Target weight: ${c.targetWeightKg} kg at ${c.weeklyLossKg} kg/week

Write today's debrief.`;
}

function dailyTemplate(c: DailyCoachContext): AiCoachNote {
  const ratio = c.targets.calories
    ? c.totals.calories / c.targets.calories
    : 0;
  const proteinPct = pct(c.totals.protein, c.targets.protein);
  const remaining = Math.round(c.targets.calories - c.totals.calories);

  if (ratio >= 0.85 && ratio <= 1.05) {
    return {
      headline: "Dialled in today",
      message: `You landed at ${Math.round(c.totals.calories)} calories against a ${c.targets.calories} target, which is exactly the kind of unremarkable day that adds up. Protein came in at ${Math.round(c.totals.protein)} g, ${proteinPct}% of target. Days like this are the whole strategy.`,
      tone: "celebrate",
      nextMove:
        proteinPct < 90
          ? `Another ${Math.max(0, c.targets.protein - Math.round(c.totals.protein))} g of protein would round it off perfectly.`
          : "Repeat this tomorrow and you will not have to think about it.",
    };
  }

  if (ratio > 1.05) {
    return {
      headline: "Above target, not off course",
      message: `Today came in around ${Math.round(c.totals.calories)} calories against your ${c.targets.calories} target — about ${Math.abs(remaining)} over. That is one day, and one day does not decide a trend. Protein was ${Math.round(c.totals.protein)} g.`,
      tone: "nudge",
      nextMove:
        "Tomorrow, front-load protein at breakfast and the rest tends to settle itself.",
    };
  }

  if (ratio > 0 && ratio < 0.72) {
    return {
      headline: "You are under-fuelled",
      message: `You logged ${Math.round(c.totals.calories)} calories against a ${c.targets.calories} target. A deficit is the point, but going this far under makes it hard to hit your protein and micronutrients, and it usually rebounds later. Adding roughly ${Math.abs(remaining)} calories would put you back in range.`,
      tone: "care",
      nextMove: "A protein-heavy snack tonight closes most of that gap.",
    };
  }

  if (c.totals.calories === 0) {
    return {
      headline: "Nothing logged yet",
      message:
        "Nothing here so far today. Type whatever you have eaten in plain English and Macronaut will do the arithmetic.",
      tone: "steady",
      nextMove: "Even a rough description is enough to work with.",
    };
  }

  return {
    headline: "Solid, unspectacular, fine",
    message: `${Math.round(c.totals.calories)} calories against a ${c.targets.calories} target, with ${Math.round(c.totals.protein)} g of protein. Not a showcase day, not a problem either. Consistency is built out of exactly these.`,
    tone: "steady",
    nextMove: remaining > 150 ? `You have about ${remaining} calories left.` : "",
  };
}

export async function writeDailyNote(
  c: DailyCoachContext,
): Promise<Sourced<AiCoachNote>> {
  if (!isGeminiConfigured) {
    return { note: dailyTemplate(c), source: "template" };
  }

  const result = await generateJson({
    system: DAILY_COACH_SYSTEM,
    prompt: dailyPrompt(c),
    schema: COACH_SCHEMA,
    validator: AiCoachNote,
    temperature: 0.75,
    maxOutputTokens: 900,
    thinkingBudget: 0,
  });

  if (!result.ok) {
    console.warn(
      `[macronaut] daily coach fell back to a template (${result.reason}): ${result.detail}`,
    );
    return { note: dailyTemplate(c), source: "template" };
  }
  return { note: result.data, source: "ai" };
}

/* ================================================================== */
/* Weight coach                                                        */
/* ================================================================== */

export type WeightCoachContext = {
  newWeightKg: number;
  previousWeightKg: number | null;
  previousLabel: string | null;
  change7: number | null;
  change14: number | null;
  ratePerWeek: number | null;
  startingWeightKg: number;
  targetWeightKg: number;
  weeklyLossKg: number;
  totalReadings: number;
  percentToGoal: number;
};

function weightPrompt(c: WeightCoachContext): string {
  const fmt = (v: number | null, unit = "kg") =>
    v === null ? "not enough data" : `${v > 0 ? "+" : ""}${v} ${unit}`;

  return `NEW READING: ${c.newWeightKg} kg
Previous reading: ${c.previousWeightKg !== null ? `${c.previousWeightKg} kg (${c.previousLabel})` : "none"}
Change over ~7 days: ${fmt(c.change7)}
Change over ~14 days: ${fmt(c.change14)}
Trend line over last 28 days: ${c.ratePerWeek === null ? "not enough data" : `${c.ratePerWeek} kg/week`}

JOURNEY
Starting weight: ${c.startingWeightKg} kg
Target weight: ${c.targetWeightKg} kg
Lost so far: ${round(c.startingWeightKg - c.newWeightKg, 1)} kg
Remaining: ${round(Math.max(0, c.newWeightKg - c.targetWeightKg), 1)} kg
Progress to goal: ${Math.round(c.percentToGoal * 100)}%
Intended rate: ${c.weeklyLossKg} kg/week
Total readings logged: ${c.totalReadings}

React to this reading.`;
}

function weightTemplate(c: WeightCoachContext): AiWeightNote {
  const lost = round(c.startingWeightKg - c.newWeightKg, 1);
  const dayChange =
    c.previousWeightKg !== null
      ? round(c.newWeightKg - c.previousWeightKg, 1)
      : null;

  if (c.totalReadings <= 1) {
    return {
      headline: "Baseline locked in",
      message: `${c.newWeightKg} kg is your starting point. From here, what matters is the line between readings, not any single number on it. Log again in a few days and the trend starts drawing itself.`,
      tone: "steady",
      trendVerdict: "early",
    };
  }

  if (c.change14 !== null && c.change14 <= -0.5) {
    return {
      headline: "Trend is pointing down",
      message: `You are down ${Math.abs(c.change14)} kg over the last fortnight, and ${lost} kg since you started. That is real, and it is the part worth paying attention to. ${dayChange !== null && dayChange > 0 ? "Today's reading ticked up slightly, which is just noise against that." : "Keep the same pattern going."}`,
      tone: "celebrate",
      trendVerdict:
        c.ratePerWeek !== null && Math.abs(c.ratePerWeek) > c.weeklyLossKg * 1.4
          ? "ahead"
          : "on-track",
    };
  }

  if (dayChange !== null && dayChange > 0) {
    return {
      headline: "Up a little, and that is fine",
      message: `The scale moved up ${dayChange} kg since ${c.previousLabel ?? "your last reading"}. Water, salt, carbs and timing all swing daily weight by a kilo or more, so a single reading tells you almost nothing. ${lost > 0.4 ? `You are still ${lost} kg below where you started.` : "Give the trend line a few more readings."}`,
      tone: "care",
      trendVerdict: c.change14 !== null && c.change14 > 0.4 ? "up" : "flat",
    };
  }

  return {
    headline: "Holding steady",
    message: `${c.newWeightKg} kg, roughly level with your last reading. Flat stretches are normal — bodies do not lose weight on a smooth line. ${lost > 0 ? `You are ${lost} kg down from your starting weight.` : "The important thing is that the readings keep coming."}`,
    tone: "steady",
    trendVerdict: "flat",
  };
}

export async function writeWeightNote(
  c: WeightCoachContext,
): Promise<Sourced<AiWeightNote>> {
  if (!isGeminiConfigured) {
    return { note: weightTemplate(c), source: "template" };
  }

  const result = await generateJson({
    system: WEIGHT_COACH_SYSTEM,
    prompt: weightPrompt(c),
    schema: WEIGHT_SCHEMA,
    validator: AiWeightNote,
    temperature: 0.75,
    maxOutputTokens: 900,
    thinkingBudget: 0,
  });

  if (!result.ok) {
    console.warn(
      `[macronaut] weight coach fell back to a template (${result.reason}): ${result.detail}`,
    );
    return { note: weightTemplate(c), source: "template" };
  }
  return { note: result.data, source: "ai" };
}

/* ================================================================== */
/* Period report                                                       */
/* ================================================================== */

export type ReportContext = {
  period: ReportPeriod;
  current: PeriodStats;
  previous: PeriodStats;
  days: DailyLog[];
  weightStart: number | null;
  weightEnd: number | null;
  targetWeightKg: number;
  weeklyLossKg: number;
};

const PERIOD_LABEL: Record<ReportPeriod, string> = {
  "7d": "last 7 days",
  "14d": "last 14 days",
  "30d": "last 30 days",
};

function reportPrompt(c: ReportContext): string {
  const skeleton = c.days
    .slice(-30)
    .map(
      (d) =>
        `${d.logDate}: ${d.entryCount === 0 ? "not logged" : `${Math.round(d.totals.calories)}/${d.targets.calories} kcal, ${Math.round(d.totals.protein)} g protein, score ${d.score}`}`,
    )
    .join("\n");

  const block = (label: string, s: PeriodStats) =>
    `${label} (${s.startIso} to ${s.endIso})
  days logged: ${s.daysLogged} of ${s.totalDays}
  avg calories: ${s.avgCalories} (avg target ${s.avgTarget})
  avg protein: ${s.avgProtein} g
  avg carbs: ${s.avgCarbs} g | avg fat: ${s.avgFat} g | avg fiber: ${s.avgFiber} g
  avg daily score: ${s.avgScore}
  days inside calorie band: ${s.onTargetDays}
  consistency: ${Math.round(s.consistency * 100)}%`;

  return `PERIOD: ${PERIOD_LABEL[c.period]}

${block("CURRENT", c.current)}

${block("PREVIOUS PERIOD OF EQUAL LENGTH", c.previous)}

WEIGHT
  start of period: ${c.weightStart !== null ? `${c.weightStart} kg` : "no reading"}
  end of period: ${c.weightEnd !== null ? `${c.weightEnd} kg` : "no reading"}
  target: ${c.targetWeightKg} kg at ${c.weeklyLossKg} kg/week

DAY BY DAY
${skeleton}

Write the review.`;
}

function reportTemplate(c: ReportContext): AiPeriodReport {
  const s = c.current;
  const p = c.previous;
  const calDelta = round(s.avgCalories - p.avgCalories);
  const proteinDelta = round(s.avgProtein - p.avgProtein);
  const sparse = s.daysLogged < Math.max(3, s.totalDays * 0.4);

  const wins: string[] = [];
  if (s.onTargetDays > 0)
    wins.push(`Inside the calorie band on ${s.onTargetDays} of ${s.totalDays} days`);
  if (proteinDelta > 5)
    wins.push(`Protein up ${proteinDelta} g a day on the previous period`);
  if (calDelta < -50)
    wins.push(`Average intake down ${Math.abs(calDelta)} kcal a day`);
  if (s.daysLogged >= s.totalDays * 0.8)
    wins.push(`Logged ${s.daysLogged} of ${s.totalDays} days`);
  if (!wins.length) wins.push(`${s.daysLogged} days logged — the habit is forming`);

  const improvements: string[] = [];
  if (s.avgFiber < 20) improvements.push(`Fiber averaged ${s.avgFiber} g — aim closer to 25 g`);
  if (proteinDelta < -5) improvements.push(`Protein slipped ${Math.abs(proteinDelta)} g a day`);
  if (s.daysLogged < s.totalDays)
    improvements.push(`${s.totalDays - s.daysLogged} unlogged day(s) leave gaps in the picture`);
  if (!improvements.length) improvements.push("Keep the calorie spikes off the weekend");

  const weightLine =
    c.weightStart !== null && c.weightEnd !== null
      ? ` Weight moved from ${c.weightStart} kg to ${c.weightEnd} kg.`
      : "";

  return {
    title: sparse
      ? "A partial picture"
      : calDelta < -50 || proteinDelta > 5
        ? "Moving in the right direction"
        : "Steady as it goes",
    summary: sparse
      ? `You logged ${s.daysLogged} of ${s.totalDays} days, so treat this as a sketch rather than a verdict. On the days you did log, you averaged ${s.avgCalories} calories against a ${s.avgTarget} target and ${s.avgProtein} g of protein.${weightLine} More logged days would make this genuinely useful.`
      : `You averaged ${s.avgCalories} calories a day against a ${s.avgTarget} target, with ${s.avgProtein} g of protein. Compared with the previous ${p.totalDays} days that is ${calDelta === 0 ? "flat" : `${Math.abs(calDelta)} kcal ${calDelta < 0 ? "lower" : "higher"}`} and ${proteinDelta === 0 ? "level" : `${Math.abs(proteinDelta)} g of protein ${proteinDelta > 0 ? "higher" : "lower"}`}. You stayed inside the calorie band on ${s.onTargetDays} days.${weightLine}`,
    wins: wins.slice(0, 4),
    improvements: improvements.slice(0, 3),
    mission:
      proteinDelta <= 0 || s.avgProtein < 100
        ? `Hit your protein target on 5 of the next ${Math.min(7, s.totalDays)} days.`
        : `Log every day for the next ${Math.min(7, s.totalDays)} days, even the messy ones.`,
    grade: sparse ? "C" : calDelta < -50 && proteinDelta >= 0 ? "A" : "B",
  };
}

export async function writePeriodReport(
  c: ReportContext,
): Promise<{ report: AiPeriodReport; source: "ai" | "template" }> {
  if (!isGeminiConfigured) {
    return { report: reportTemplate(c), source: "template" };
  }

  const result = await generateJson({
    system: REPORT_SYSTEM,
    prompt: reportPrompt(c),
    schema: REPORT_SCHEMA,
    validator: AiPeriodReport,
    temperature: 0.7,
    maxOutputTokens: 1600,
    thinkingBudget: 512,
  });

  if (!result.ok) {
    console.warn(
      `[macronaut] period report fell back to a template (${result.reason}): ${result.detail}`,
    );
    return { report: reportTemplate(c), source: "template" };
  }
  return { report: result.data, source: "ai" };
}

