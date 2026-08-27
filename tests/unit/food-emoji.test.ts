import { describe, expect, it } from "vitest";

import { isEmoji, resolveFoodEmoji } from "@/lib/food-emoji";

/**
 * This exists because the model returned the word "bowl" for a rice bowl and
 * the app rendered it as text in the icon circle. "bowl" is a perfectly valid
 * short string, so nothing caught it.
 */
describe("isEmoji", () => {
  it("accepts actual emoji", () => {
    for (const e of ["🍚", "🥣", "🍗", "☕", "🍽️", "🫐"]) {
      expect(isEmoji(e)).toBe(true);
    }
  });

  it("rejects words, which is the whole point", () => {
    for (const w of ["bowl", "rice", "chicken", "", "  ", "n/a", "food"]) {
      expect(isEmoji(w)).toBe(false);
    }
  });

  it("rejects something suspiciously long", () => {
    expect(isEmoji("🍚🍚🍚🍚🍚🍚🍚🍚🍚")).toBe(false);
  });
});

describe("resolveFoodEmoji", () => {
  it("keeps a good suggestion untouched", () => {
    expect(resolveFoodEmoji("Tahini Chicken Rice Bowl", "🍚")).toBe("🍚");
  });

  it("replaces the word that caused this", () => {
    const resolved = resolveFoodEmoji("Tahini Chicken Rice Bowl", "bowl");
    expect(isEmoji(resolved)).toBe(true);
    expect(resolved).not.toBe("🍽️");
  });

  it("resolves from the name when nothing is suggested", () => {
    expect(resolveFoodEmoji("Grilled Chicken")).toBe("🍗");
    expect(resolveFoodEmoji("Coke Zero")).toBe("🥤");
    expect(resolveFoodEmoji("Activia Yogurt Green Apple")).toBe("🥛");
    expect(resolveFoodEmoji("Porridge with honey")).toBe("🥣");
  });

  /** A dish should win over an ingredient it happens to contain. */
  it("prefers the dish over its ingredients", () => {
    expect(resolveFoodEmoji("Chicken Sandwich")).toBe("🥪");
    expect(resolveFoodEmoji("Chipotle Chicken Wrap")).toBe("🌯");
    expect(resolveFoodEmoji("Chicken Biryani")).toBe("🍚");
    expect(resolveFoodEmoji("Chicken Caesar Salad")).toBe("🥗");
  });

  it("never returns a non-emoji, whatever it is given", () => {
    const names = [
      "Tahini Chicken Rice Bowl",
      "something entirely unrecognisable",
      "",
      "123",
      "Ål og æggekage",
    ];
    for (const name of names) {
      for (const suggested of [undefined, "", "bowl", "🍚", "not an emoji"]) {
        expect(isEmoji(resolveFoodEmoji(name, suggested))).toBe(true);
      }
    }
  });

  it("falls back to a plate only when nothing matches", () => {
    expect(resolveFoodEmoji("qwertyuiop")).toBe("🍽️");
  });

  it("covers the common things without falling back", () => {
    const common = [
      "Scrambled Eggs", "Toast", "Banana", "Apple", "Rice", "Pasta",
      "Pizza", "Burger", "Fries", "Salad", "Soup", "Coffee", "Tea",
      "Protein Shake", "Almonds", "Chocolate", "Yogurt", "Cheese",
      "Salmon", "Steak", "Broccoli", "Sweet Potato", "Naan", "Daal",
      "Sushi", "Ramen", "Dumplings", "Falafel", "Hummus", "Avocado",
    ];
    const fellBack = common.filter((f) => resolveFoodEmoji(f) === "🍽️");
    expect(fellBack).toEqual([]);
  });
});
