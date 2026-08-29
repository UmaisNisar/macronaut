import { describe, expect, it } from "vitest";

import { looksLikeBarcode, toLuminance } from "@/lib/barcode-reader";

/* ------------------------------------------------------------------ */
/* RGBA -> luminance                                                   */
/* ------------------------------------------------------------------ */

describe("toLuminance", () => {
  /*
   * The trap this exists for. RGBLuminanceSource takes a Uint8ClampedArray as
   * luminances already — one byte per pixel — so handing it ImageData.data
   * straight from a canvas reads every R, G, B and A byte as its own pixel.
   * It throws nothing and reads nothing; the scanner just never finds a
   * barcode. Length is the assertion that catches it.
   */
  it("returns one byte per pixel, not one per channel", () => {
    const rgba = new Uint8ClampedArray(4 * 10); // 10 pixels
    expect(toLuminance(rgba)).toHaveLength(10);
  });

  it("maps black and white to the ends of the range", () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
    const lum = toLuminance(rgba);
    expect(lum[0]).toBe(0);
    expect(lum[1]).toBe(255);
  });

  it("weights green most heavily, as ZXing does", () => {
    const px = (r: number, g: number, b: number) =>
      toLuminance(new Uint8ClampedArray([r, g, b, 255]))[0];
    // (r + 2g + b) / 4
    expect(px(255, 0, 0)).toBe(64);
    expect(px(0, 255, 0)).toBe(128);
    expect(px(0, 0, 255)).toBe(64);
  });

  it("ignores alpha, so a transparent frame is not read as black", () => {
    expect(toLuminance(new Uint8ClampedArray([255, 255, 255, 0]))[0]).toBe(255);
  });
});

/* ------------------------------------------------------------------ */
/* Check digits                                                        */
/* ------------------------------------------------------------------ */

describe("looksLikeBarcode", () => {
  it("accepts real EAN-13 codes", () => {
    expect(looksLikeBarcode("5449000214911")).toBe(true); // Coca-Cola
    expect(looksLikeBarcode("4006381333931")).toBe(true);
  });

  /*
   * UPC-A comes back as twelve digits from ZXing and from the native
   * detector, and Open Food Facts resolves both it and its zero-padded
   * EAN-13 form to the same product — checked against the live API — so both
   * have to pass.
   */
  it("accepts UPC-A in both the 12- and 13-digit forms", () => {
    expect(looksLikeBarcode("012000001086")).toBe(true);
    expect(looksLikeBarcode("0012000001086")).toBe(true);
  });

  it("rejects a code whose check digit is wrong", () => {
    expect(looksLikeBarcode("5449000214912")).toBe(false);
    expect(looksLikeBarcode("4006381333932")).toBe(false);
  });

  it("rejects anything that is not digits", () => {
    expect(looksLikeBarcode("")).toBe(false);
    expect(looksLikeBarcode("54490002149a1")).toBe(false);
    expect(looksLikeBarcode("549-000-21491")).toBe(false);
  });

  /* A misread digit is the failure that matters: it looks like a confident
     answer and looks up a product that is not the one in your hand. */
  it("catches a single transposed digit", () => {
    expect(looksLikeBarcode("5449000241911")).toBe(false);
  });

  it("passes through lengths that carry no checksum here", () => {
    expect(looksLikeBarcode("12345678901")).toBe(true); // 11, code_128-ish
    expect(looksLikeBarcode("12345")).toBe(false); // too short to be real
    expect(looksLikeBarcode("123456789012345")).toBe(false); // too long
  });
});
