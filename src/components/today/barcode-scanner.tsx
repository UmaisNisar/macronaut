"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Barcode, ImageUp, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Haptic } from "@/components/ui/haptic";
import { logBarcodeAction } from "@/server/actions";
import { useUndoToast } from "@/components/today/undo";
import {
  createBarcodeDecoder,
  looksLikeBarcode,
  type BarcodeDecoder,
} from "@/lib/barcode-reader";
import type { Iso } from "@/lib/date";

/**
 * Scan a packaged food instead of describing it.
 *
 * This used to point the camera only on browsers with a native
 * BarcodeDetector, and hand everyone else — which in practice means every
 * iPhone — a numeric field and an apology for it. The camera now runs
 * everywhere; see lib/barcode-reader for which decoder answers and why.
 *
 * Three ways in, in the order they are worth trying:
 *
 *   1. Live camera. What anyone means by "scan".
 *   2. A still photo, from the camera or the library. Holding a phone steady
 *      enough for a live read is genuinely hard on a curved bottle or in a
 *      dim cupboard, and a single sharp frame decodes when a hundred shaky
 *      ones will not. It also covers a refused camera permission.
 *   3. Typing the number, still there as the floor.
 */

type Phase = "scanning" | "photo" | "manual";

export function BarcodeScanner({ date }: { date: Iso }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState("");
  const [phase, setPhase] = useState<Phase>("scanning");
  const [hint, setHint] = useState("Starting the camera…");
  const offerUndo = useUndoToast();

  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const scanning = useRef(false);
  const decoder = useRef<BarcodeDecoder | null>(null);

  const stopCamera = useCallback(() => {
    scanning.current = false;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  const close = useCallback(() => {
    stopCamera();
    setOpen(false);
  }, [stopCamera]);

  const submit = useCallback(
    async (code: string) => {
      if (busy) return;
      setBusy(true);
      const result = await logBarcodeAction({ code, date });
      setBusy(false);
      if (!result.ok) {
        toast.error(result.error);
        // Keep the sheet open so a bad read can be retried without
        // starting over — a miss here is usually one blurry frame.
        scanning.current = true;
        return;
      }
      // Replaces the plain confirmation rather than sitting beside it: a
      // scan is easy to fire at the wrong packet, and two toasts saying
      // almost the same thing is worse than one that can be acted on.
      offerUndo(result.added, date);
      close();
      router.refresh();
    },
    [busy, close, date, offerUndo, router],
  );

  /** Shared by the live loop and the still photo. */
  const ensureDecoder = useCallback(async () => {
    if (!decoder.current) decoder.current = await createBarcodeDecoder();
    return decoder.current;
  }, []);

  // Detection loop. State lives in refs so a queued frame callback cannot
  // resurrect a scan after the camera has been shut off.
  useEffect(() => {
    if (!open || phase !== "scanning") return;
    let raf = 0;
    let cancelled = false;

    const run = async () => {
      let read: BarcodeDecoder;
      try {
        read = await ensureDecoder();
      } catch {
        setHint("");
        setPhase("manual");
        return;
      }
      if (cancelled) return;

      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = media;
        if (video.current) {
          video.current.srcObject = media;
          await video.current.play();
        }
      } catch {
        // Denied, or no camera. A photo still works — the picker can reach
        // the library even when live capture is refused.
        setPhase("photo");
        return;
      }

      setHint(
        read.kind === "native"
          ? "Point at the barcode"
          : "Point at the barcode — hold it steady",
      );
      scanning.current = true;

      const tick = async () => {
        if (!scanning.current || !video.current) return;
        const code = await read.read(video.current);
        if (code && looksLikeBarcode(code)) {
          scanning.current = false;
          await submit(code);
          return;
        }
        raf = requestAnimationFrame(() => void tick());
      };
      void tick();
    };

    void run();
    return () => {
      cancelled = true;
      scanning.current = false;
      cancelAnimationFrame(raf);
      stopCamera();
    };
  }, [open, phase, ensureDecoder, stopCamera, submit]);

  /** Decode one still. Bigger and sharper than any live frame. */
  const readPhoto = useCallback(
    async (file: File) => {
      setBusy(true);
      setHint("Reading the photo…");
      try {
        const read = await ensureDecoder();
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("no canvas");
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close?.();

        const code = await read.read(canvas);
        if (code && looksLikeBarcode(code)) {
          setBusy(false);
          await submit(code);
          return;
        }
        setBusy(false);
        setHint("");
        toast("Could not read that one 🔍", {
          description: "Try filling the frame with the bars, or type it in.",
        });
        setPhase("manual");
      } catch {
        setBusy(false);
        setHint("");
        setPhase("manual");
      }
    },
    [ensureDecoder, submit],
  );

  return (
    <>
      <Haptic className="shrink-0">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => {
            setPhase("scanning");
            setHint("Starting the camera…");
            setManual("");
            setOpen(true);
          }}
          aria-label="Log a packaged food by barcode"
          title="Scan a barcode"
        >
          <Barcode className="size-4" />
          <span className="sm:hidden">Scan</span>
        </Button>
      </Haptic>

      {open ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="sticker w-full max-w-sm p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-bold">Scan a barcode</p>
              <button
                type="button"
                onClick={close}
                aria-label="Close scanner"
                className="grid size-9 place-items-center rounded-full text-[var(--ink-soft)] hover:bg-[var(--muted)]"
              >
                <X className="size-4" />
              </button>
            </div>

            {phase === "scanning" ? (
              <>
                <div className="relative">
                  <video
                    ref={video}
                    className="aspect-[4/3] w-full rounded-2xl bg-black object-cover"
                    muted
                    playsInline
                  />
                  {/* Shows where the decoder is actually looking — it reads a
                      band across the middle, not the whole frame. */}
                  <div
                    className="pointer-events-none absolute inset-x-4 top-1/2 h-20 -translate-y-1/2 rounded-xl border-2 border-white/70"
                    aria-hidden
                  />
                </div>
                <p className="mt-2 text-center text-xs font-medium text-[var(--ink-soft)]">
                  {busy ? "Looking it up…" : hint}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setPhase("photo");
                  }}
                  className="mt-2 w-full text-center text-xs font-semibold text-[var(--violet)] underline-offset-2 hover:underline"
                >
                  Not catching it? Take a photo instead
                </button>
              </>
            ) : null}

            {phase === "photo" ? (
              <div className="text-center">
                <p className="mb-3 text-xs leading-relaxed font-medium text-[var(--ink-soft)]">
                  Take a close, straight-on photo of the barcode — fill the
                  frame with the bars. One sharp picture reads better than a
                  wobbly camera.
                </p>
                <label className="tappable sticker-flat mx-auto flex cursor-pointer items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold">
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ImageUp className="size-4" />
                  )}
                  {busy ? "Reading…" : "Choose or take a photo"}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      // Cleared so picking the same file twice still fires.
                      e.target.value = "";
                      if (file) void readPhoto(file);
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setPhase("manual")}
                  className="mt-3 w-full text-center text-xs font-semibold text-[var(--violet)] underline-offset-2 hover:underline"
                >
                  Type the number instead
                </button>
              </div>
            ) : null}

            {phase === "manual" ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void submit(manual.trim());
                }}
              >
                <p className="mb-2 text-xs leading-relaxed font-medium text-[var(--ink-soft)]">
                  Type the number under the bars and you still get the exact
                  figures off the label.
                </p>
                <input
                  inputMode="numeric"
                  autoFocus
                  value={manual}
                  onChange={(e) => setManual(e.target.value.replace(/\D/g, ""))}
                  placeholder="5449000214911"
                  aria-label="Barcode number"
                  className="field numeral w-full rounded-2xl bg-[var(--inset)] px-4 py-3 text-base outline-none"
                />
                <Button
                  type="submit"
                  className="mt-3 w-full"
                  disabled={busy || manual.length < 6}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                  Look it up
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setPhase("scanning");
                    setHint("Starting the camera…");
                  }}
                  className="mt-3 w-full text-center text-xs font-semibold text-[var(--violet)] underline-offset-2 hover:underline"
                >
                  Use the camera instead
                </button>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
