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

  it("says what it assumed, so the numbers can be judged", () => {
    const r = estimateFromText("large chicken with rice");
    expect(r.assumptions.length).toBeGreaterThan(0);
  });
});
