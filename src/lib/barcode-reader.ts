"use client";

/**
 * Reading a barcode, on every browser rather than most of them.
 *
 * Chrome and Android Chrome ship BarcodeDetector, which is native, instant and
 * free. Safari does not, and has not for years, so the iPhone — the device
 * most likely to be pointed at a cereal packet in a kitchen — used to get a
 * numeric keypad and an apology. Typing thirteen digits off a label is the
 * thing a scanner exists to avoid.
 *
 * So where the native API is missing, ZXing is loaded instead and given the
 * same job. Two deliberate choices about how:
 *
 * It is a dynamic import, so the decoder is fetched only when someone without
 * BarcodeDetector actually opens the scanner. Nobody on Chrome pays for it,
 * and nobody pays for it merely by loading the page.
 *
 * It is the pure-JavaScript build, not the WebAssembly one. The WASM decoder
 * is faster, but instantiating it needs 'wasm-unsafe-eval' in the script-src
 * of a CSP that currently does not allow eval of any kind, and its .wasm
 * would have to be self-hosted to survive connect-src 'self'. Relaxing the
 * policy of the whole app to save a few milliseconds per frame is a bad
 * trade; scanning is already limited by how steady a hand is.
 *
 * Reading the printed digits with the language model was the other option and
 * is not used. A barcode lookup currently costs nothing — Open Food Facts is
 * free and needs no key — so routing it through Gemini would spend one of the
 * twenty daily calls on a job a local decoder does for nothing. It is also
 * less reliable at the only thing that matters here: one wrong digit is a
 * different product, or none.
 */

export type BarcodeSource = HTMLVideoElement | HTMLCanvasElement;

export type BarcodeDecoder = {
  /** The code, or null when this frame simply had no readable barcode. */
  read: (source: BarcodeSource) => Promise<string | null>;
  /** Which implementation answered, for the hint shown under the viewfinder. */
  kind: "native" | "zxing";
};

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39"];

type NativeDetector = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};
type NativeCtor = new (options?: { formats?: string[] }) => NativeDetector;

export function hasNativeDetector(): boolean {
  return typeof window !== "undefined" && "BarcodeDetector" in window;
}

/**
 * A barcode is a wide, short thing, and the middle of the frame is where
 * people put it. Handing the decoder the full frame makes it scan a lot of
 * shelf; a centre band is both faster and less likely to lock onto something
 * else on the packet.
 */
function centreBand(source: BarcodeSource): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} | null {
  const width =
    source instanceof HTMLVideoElement ? source.videoWidth : source.width;
  const height =
    source instanceof HTMLVideoElement ? source.videoHeight : source.height;
  if (!width || !height) return null;

  const bandHeight = Math.max(64, Math.round(height * 0.5));
  const top = Math.round((height - bandHeight) / 2);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = bandHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, top, width, bandHeight, 0, 0, width, bandHeight);
  return { canvas, ctx };
}

/**
 * RGBA to one grey byte per pixel.
 *
 * Necessary, and easy to get wrong: given a Uint8ClampedArray,
 * RGBLuminanceSource treats it as luminances already — one byte per pixel,
 * used as-is. Handing it ImageData.data straight from the canvas means every
 * red, green, blue and alpha byte is read as its own pixel, so the decoder
 * sees an image four times too long made of nonsense and quietly finds
 * nothing at all. It never throws; it just never reads a barcode. This was
 * written that way first, and only a test against a real generated EAN-13
 * caught it.
 *
 * The weighting is green-favoured to match what ZXing does internally for
 * packed-integer input.
 */
export function toLuminance(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length / 4);
  for (let i = 0, p = 0; p < out.length; i += 4, p++) {
    out[p] = (rgba[i] + 2 * rgba[i + 1] + rgba[i + 2]) / 4;
  }
  return out;
}

async function nativeDecoder(): Promise<BarcodeDecoder> {
  const Ctor = (window as unknown as { BarcodeDetector: NativeCtor })
    .BarcodeDetector;
  const detector = new Ctor({ formats: FORMATS });
  return {
    kind: "native",
    read: async (source) => {
      try {
        const found = await detector.detect(source);
        return found[0]?.rawValue ?? null;
      } catch {
        // An undecodable frame is the normal case, not a failure.
        return null;
      }
    },
  };
}

async function zxingDecoder(): Promise<BarcodeDecoder> {
  const {
    BinaryBitmap,
    DecodeHintType,
    HybridBinarizer,
    MultiFormatOneDReader,
    RGBLuminanceSource,
  } = await import("@zxing/library");

  // 1D only: this is a grocery scanner, and skipping the QR/DataMatrix
  // readers is both faster per frame and removes a class of wrong answer.
  const hints = new Map<number, unknown>();
  hints.set(DecodeHintType.TRY_HARDER, true);
  const reader = new MultiFormatOneDReader(
    hints as ConstructorParameters<typeof MultiFormatOneDReader>[0],
  );

  return {
    kind: "zxing",
    read: async (source) => {
      const band = centreBand(source);
      if (!band) return null;
      const { canvas, ctx } = band;
      try {
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const bitmap = new BinaryBitmap(
          new HybridBinarizer(
            new RGBLuminanceSource(
              toLuminance(data),
              canvas.width,
              canvas.height,
            ),
          ),
        );
        const result = reader.decode(bitmap);
        const text = result.getText();
        return text ? text.trim() : null;
      } catch {
        // ZXing throws NotFoundException for "no barcode in this frame",
        // which is what most frames are.
        return null;
      } finally {
        reader.reset();
      }
    },
  };
}

/** Native where it exists, ZXing where it does not. */
export async function createBarcodeDecoder(): Promise<BarcodeDecoder> {
  return hasNativeDetector() ? nativeDecoder() : zxingDecoder();
}

/**
 * A last sanity check before spending a network lookup.
 *
 * EAN-13/UPC-A carry a check digit, and verifying it locally turns most
 * misreads into "keep looking" instead of a confident lookup for a product
 * that does not exist. Lengths without a defined checksum here are accepted
 * as-is rather than rejected.
 */
export function looksLikeBarcode(code: string): boolean {
  // UPC-A arrives as twelve digits from both decoders and Open Food Facts
  // resolves it and its zero-padded EAN-13 form to the same product, so
  // neither is normalised into the other.
  if (!/^\d+$/.test(code)) return false;
  if (code.length !== 8 && code.length !== 12 && code.length !== 13) {
    return code.length >= 6 && code.length <= 14;
  }
  const digits = [...code].map(Number);
  const check = digits.pop() as number;
  // Weights alternate 3/1 reading right-to-left from the digit before check.
  let sum = 0;
  for (let i = digits.length - 1, weight = 3; i >= 0; i--, weight = 4 - weight) {
    sum += digits[i] * weight;
  }
  return (10 - (sum % 10)) % 10 === check;
}
