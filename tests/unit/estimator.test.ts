import { describe, expect, it } from "vitest";

import { estimateFromText } from "@/lib/ai/estimator";

/**
 * The offline estimator only runs when the model is unavailable — which, on a
 * rate-limited key, is often. It will never match the model, but it must not
 * produce answers that are obviously wrong, because a number nobody believes is
 * worse than no number.
 */
describe("estimateFromText", () => {
  const kcal = (text: string, name: RegExp) =>
    estimateFromText(text).foods.find((f) => name.test(f.name))?.calories ?? 0;

  it("separates a dish from its side", () => {
    const items = estimateFromText("tahini chicken with rice").foods;
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.some((f) => /chicken/i.test(f.name))).toBe(true);
    expect(items.some((f) => /rice/i.test(f.name))).toBe(true);
  });

  it("scales with size words rather than ignoring them", () => {
    const small = kcal("small chicken", /chicken/i);
    const regular = kcal("chicken", /chicken/i);
    const large = kcal("large chicken", /chicken/i);
    expect(small).toBeLessThan(regular);
    expect(large).toBeGreaterThan(regular);
  });

  it("still prefers an explicit count over a size word", () => {
    const items = estimateFromText("3 eggs").foods;
    const eggs = items.find((f) => /egg/i.test(f.name));
    expect(eggs?.estimatedQuantity).toMatch(/3/);
  });

  it("prefers an explicit weight over everything", () => {
    const items = estimateFromText("200g chicken").foods;
    expect(items[0]?.estimatedQuantity).toMatch(/200 g/);
  });

  it("never returns negative or absurd energy", () => {
    for (const text of ["", "asdfghjkl", "large large large chicken"]) {
      for (const f of estimateFromText(text).foods) {
        expect(f.calories).toBeGreaterThanOrEqual(0);
        expect(f.calories).toBeLessThan(5000);
      }
    }
  });

  it("says what it assumed, on the food it assumed it about", () => {
    const r = estimateFromText("chicken with rice");
    expect(r.foods.length).toBeGreaterThanOrEqual(2);
    expect(r.foods.some((f) => f.assumptions.length > 0)).toBe(true);
  });

  /**
   * The bug this guards: one entry listing two foods used to stamp the whole
   * request's assumptions onto every item, so a yogurt logged alongside a
   * rice bowl claimed the bowl's portion size as its own.
   */
  it("never puts one food's assumption on another", () => {
    const r = estimateFromText("chicken with rice");
    const chicken = r.foods.find((f) => /chicken/i.test(f.name));
    const rice = r.foods.find((f) => /rice/i.test(f.name));
    if (!chicken || !rice) throw new Error("expected both foods to be found");
    for (const note of chicken.assumptions) expect(note).not.toMatch(/rice/i);
    for (const note of rice.assumptions) expect(note).not.toMatch(/chicken/i);
  });
});
