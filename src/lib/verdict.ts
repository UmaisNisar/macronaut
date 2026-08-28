import { isOnTarget } from "@/lib/nutrition";

/**
 * Would eating this be a good idea?
 *
 * The app could only ever tell you about food after you had committed to it,
 * which is the wrong way round for the question people actually have standing
 * in a shop: not "what did I just eat" but "can I have this".
 *
 * The answer is only ever about today's numbers. It deliberately does not try
 * to be about the week, the trend or the goal — a verdict that hedges across
 * four timeframes is one nobody can act on in the ten seconds they have.
 */

export type VerdictTone = "good" | "tight" | "over";

export type Verdict = {
  tone: VerdictTone;
  /** Three or four words. The answer, before any of the reasoning. */
  headline: string;
  /** One sentence of arithmetic, in plain numbers. */
  detail: string;
  /** Anything else worth knowing. Usually none, occasionally one. */
  notes: string[];
  /** Where the day lands if they eat it. */
  after: { calories: number; remaining: number };
};

export type CheckedFood = {
  calories: number;
  protein: number;
  sugar: number;
};

export type DayContext = {
  eaten: number;
  target: number;
  sugarEaten: number;
  sugarCeiling: number;
};

const round = (n: number) => Math.round(n);
const kcal = (n: number) => `${round(n).toLocaleString()} kcal`;

/**
 * Sugar and protein are mentioned only when they change the answer.
 *
 * A note on every single check is noise, and noise is what makes people stop
 * reading the useful ones.
 */
function noteFor(food: CheckedFood, day: DayContext): string[] {
  const notes: string[] = [];

  if (day.sugarCeiling > 0 && food.sugar > 0) {
    const share = food.sugar / day.sugarCeiling;
    if (share >= 0.5) {
      notes.push(
        `That is ${round(food.sugar)} g of sugar — over half your ${round(day.sugarCeiling)} g ceiling for the day, in one go.`,
      );
    } else if (share >= 0.25) {
      notes.push(
        `${round(food.sugar)} g of sugar, about ${Math.round(share * 100)}% of today's ceiling.`,
      );
    }
  }

  // Worth saying when it is the thing that makes an expensive item worth it.
  if (food.protein >= 20) {
    notes.push(`${round(food.protein)} g of protein, which is a solid hit.`);
  }

  return notes;
}

export function verdictFor(food: CheckedFood, day: DayContext): Verdict {
  const target = day.target;
  const before = day.eaten;
  const after = before + food.calories;
  const remainingNow = target - before;
  const remainingAfter = target - after;
  const notes = noteFor(food, day);
  const result = { after: { calories: round(after), remaining: round(remainingAfter) } };

  // No target to measure against: say what it costs and stop pretending.
  if (target <= 0) {
    return {
      tone: "good",
      headline: "No target set",
      detail: `This is about ${kcal(food.calories)}. Set a goal and Macronaut can tell you whether it fits.`,
      notes,
      ...result,
    };
  }

  /*
   * Already over before eating anything. Framed as "on top of" rather than as
   * a fresh verdict, because the honest information is how much further this
   * goes, not a second telling-off for a decision already made.
   */
  if (remainingNow <= 0) {
    return {
      tone: "over",
      headline: "Already past today",
      detail: `You are ${kcal(-remainingNow)} over already, and this would add ${kcal(food.calories)} on top. It is one day.`,
      notes,
      ...result,
    };
  }

  // Fits inside what is left, with room to spare.
  if (food.calories <= remainingNow) {
    const leftAfter = remainingAfter;
    const roomy = leftAfter >= target * 0.15;
    return {
      tone: "good",
      headline: roomy ? "Room for this" : "Fits, just about",
      detail: roomy
        ? `${kcal(food.calories)}, and you would still have ${kcal(leftAfter)} left today.`
        : `${kcal(food.calories)} leaves you ${kcal(leftAfter)} for the rest of the day, which is not much.`,
      notes,
      ...result,
    };
  }

  /*
   * Past the number but still inside the band the rest of the app counts as a
   * good day. Saying "over" here would contradict the streak that is about to
   * tick up, so it does not.
   */
  if (isOnTarget(after, target)) {
    return {
      tone: "tight",
      headline: "Tips you over, barely",
      detail: `You would finish ${kcal(after - target)} above target — still inside the range that counts as an on-target day.`,
      notes,
      ...result,
    };
  }

  const over = after - target;
  return {
    tone: "over",
    headline: over > target * 0.25 ? "That is a big one" : "Puts you over",
    detail: `${kcal(food.calories)} against ${kcal(remainingNow)} left would finish the day ${kcal(over)} over.`,
    notes,
    ...result,
  };
}

/**
 * What a smaller portion would cost, for the two cases where the answer is
 * "not that much of it".
 *
 * Offered rather than imposed: the useful reply to "you cannot have that" is
 * usually "you can have some of it", and working out half of 640 while stood
 * at a counter is exactly the arithmetic this app exists to remove.
 */
export function portionThatFits(
  food: CheckedFood,
  day: DayContext,
): { fraction: number; calories: number } | null {
  const remaining = day.target - day.eaten;
  if (remaining <= 0 || food.calories <= remaining) return null;

  // Only the fractions a person would actually serve themselves.
  for (const fraction of [0.75, 0.5, 0.25]) {
    if (food.calories * fraction <= remaining) {
      return { fraction, calories: round(food.calories * fraction) };
    }
  }
  return null;
}
