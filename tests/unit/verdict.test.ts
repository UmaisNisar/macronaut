import { describe, expect, it } from "vitest";

import { portionThatFits, verdictFor } from "@/lib/verdict";
import { isOnTarget } from "@/lib/nutrition";

/**
 * The check-before-you-eat answer. It is read in about three seconds while
 * standing somewhere, so the two things that matter are that it never
 * contradicts the rest of the app and that it never hedges.
 */

const day = (eaten: number, extra: Partial<Parameters<typeof verdictFor>[1]> = {}) => ({
  eaten,
  target: 2000,
  sugarEaten: 0,
  sugarCeiling: 50,
  ...extra,
});

const food = (calories: number, protein = 0, sugar = 0) => ({ calories, protein, sugar });

describe("verdictFor", () => {
  it("says yes when there is plenty left", () => {
    const v = verdictFor(food(300), day(800));
    expect(v.tone).toBe("good");
    expect(v.headline).toBe("Room for this");
    expect(v.after.remaining).toBe(900);
  });

  it("warns when it fits but leaves almost nothing", () => {
    const v = verdictFor(food(600), day(1300));
    expect(v.tone).toBe("good");
    expect(v.headline).toBe("Fits, just about");
    expect(v.detail).toMatch(/not much/);
  });

  it("says no when it would blow the day", () => {
    const v = verdictFor(food(1200), day(1500));
    expect(v.tone).toBe("over");
    expect(v.detail).toContain("700");
  });

  it("calls a very large overshoot what it is", () => {
    expect(verdictFor(food(1400), day(1500)).headline).toBe("That is a big one");
    expect(verdictFor(food(300), day(1900)).headline).toBe("Puts you over");
  });

  /**
   * The important one. A day at 2,080 against a 2,000 target still counts as
   * on-target everywhere else in the app, so a verdict calling it "over" would
   * contradict the streak that is about to tick up.
   */
  it("never contradicts the band the rest of the app uses", () => {
    const v = verdictFor(food(180), day(1980));
    expect(isOnTarget(2160, 2000)).toBe(true);
    expect(v.tone).toBe("tight");
    expect(v.detail).toMatch(/on-target day/);
  });

  it("does not tell someone off twice when they are already over", () => {
    const v = verdictFor(food(400), day(2300));
    expect(v.tone).toBe("over");
    expect(v.headline).toBe("Already past today");
    expect(v.detail).toMatch(/one day/);
  });

  it("admits when there is no target to answer against", () => {
    const v = verdictFor(food(400), day(0, { target: 0 }));
    expect(v.headline).toBe("No target set");
    expect(v.detail).toContain("400");
  });

  it("reports where the day would land, not just whether it fits", () => {
    const v = verdictFor(food(450), day(1000));
    expect(v.after.calories).toBe(1450);
    expect(v.after.remaining).toBe(550);
  });
});

describe("the notes beside the verdict", () => {
  it("flags sugar worth flagging", () => {
    const v = verdictFor(food(200, 0, 30), day(500));
    expect(v.notes.join(" ")).toMatch(/over half your 50 g ceiling/);
  });

  it("mentions a meaningful share without calling it a blowout", () => {
    const v = verdictFor(food(200, 0, 15), day(500));
    expect(v.notes.join(" ")).toMatch(/15 g of sugar/);
    expect(v.notes.join(" ")).not.toMatch(/over half/);
  });

  /** A note on every check is noise, and noise is what stops people reading. */
  it("stays quiet about a trace of sugar", () => {
    expect(verdictFor(food(200, 0, 4), day(500)).notes).toEqual([]);
  });

  it("gives credit for protein, because it changes whether it is worth it", () => {
    const v = verdictFor(food(400, 38), day(500));
    expect(v.notes.join(" ")).toMatch(/38 g of protein/);
  });

  it("says nothing about sugar when no ceiling is recorded", () => {
    const v = verdictFor(food(200, 0, 40), day(500, { sugarCeiling: 0 }));
    expect(v.notes).toEqual([]);
  });
});

describe("portionThatFits", () => {
  it("offers the largest sensible fraction that still fits", () => {
    // 500 left, an 800 kcal plate: three quarters is 600, half is 400.
    expect(portionThatFits(food(800), day(1500))).toEqual({
      fraction: 0.5,
      calories: 400,
    });
  });

  it("offers three quarters when that is enough", () => {
    expect(portionThatFits(food(600), day(1500))?.fraction).toBe(0.75);
  });

  it("offers nothing when the whole thing already fits", () => {
    expect(portionThatFits(food(300), day(1000))).toBeNull();
  });

  it("offers nothing when even a quarter does not fit", () => {
    expect(portionThatFits(food(4000), day(1500))).toBeNull();
  });

  it("offers nothing when the day is already spent", () => {
    expect(portionThatFits(food(300), day(2100))).toBeNull();
  });
});
