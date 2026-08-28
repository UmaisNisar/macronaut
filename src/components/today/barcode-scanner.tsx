"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Barcode, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Haptic } from "@/components/ui/haptic";
import { logBarcodeAction } from "@/server/actions";
import { useUndoToast } from "@/components/today/undo";
import type { Iso } from "@/lib/date";

/**
 * Scan a packaged food instead of describing it.
 *
 * Uses the browser's own BarcodeDetector, which is fast and free where it
 * exists. It does not exist everywhere — notably not in Safari — so rather than
 * ship a scanner that silently does nothing on an iPhone, unsupported browsers
 * get a number field. Typing thirteen digits is worse than pointing a camera,
 * but it is a great deal better than a dead button, and it still ends in exact
 * label data rather than a guess.
 */

type Detector = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};

type DetectorCtor = new (options?: { formats?: string[] }) => Detector;

function detectorSupported(): boolean {
  return typeof window !== "undefined" && "BarcodeDetector" in window;
}

export function BarcodeScanner({ date }: { date: Iso }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState("");
  const [supported, setSupported] = useState(false);
  const offerUndo = useUndoToast();

  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const scanning = useRef(false);

  const stop = useCallback(() => {
    scanning.current = false;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setOpen(false);
  }, []);

  const submit = useCallback(
    async (code: string) => {
      if (busy) return;
      setBusy(true);
      const result = await logBarcodeAction({ code, date });
      setBusy(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      // Replaces the plain confirmation rather than sitting beside it: a
      // scan is easy to fire at the wrong packet, and two toasts saying
      // almost the same thing is worse than one that can be acted on.
      offerUndo(result.added, date);
      stop();
      router.refresh();
    },
    [busy, date, offerUndo, router, stop],
  );

  // Detection loop. Kept in a ref rather than state so a frame callback cannot
  // resurrect a scan after the camera has been shut off.
  useEffect(() => {
    if (!open || !detectorSupported()) return;
    let raf = 0;

    const run = async () => {
      const Ctor = (window as unknown as { BarcodeDetector: DetectorCtor })
        .BarcodeDetector;
      const detector = new Ctor({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"],
      });

      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        stream.current = media;
        if (video.current) {
          video.current.srcObject = media;
          await video.current.play();
        }
      } catch {
        toast.error("No camera access — type the number instead.");
        setSupported(false);
        return;
      }

      scanning.current = true;
      const tick = async () => {
        if (!scanning.current || !video.current) return;
        try {
          const found = await detector.detect(video.current);
          const code = found[0]?.rawValue;
          if (code) {
            scanning.current = false;
            await submit(code);
            return;
          }
        } catch {
          // A frame that cannot be decoded is the normal case, not an error.
        }
        raf = requestAnimationFrame(() => void tick());
      };
      void tick();
    };

    void run();
    return () => {
      scanning.current = false;
      cancelAnimationFrame(raf);
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, [open, submit]);

  return (
    <>
      <Haptic className="shrink-0">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => {
            setSupported(detectorSupported());
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
                onClick={stop}
                aria-label="Close scanner"
                className="grid size-9 place-items-center rounded-full text-[var(--ink-soft)] hover:bg-[var(--muted)]"
              >
                <X className="size-4" />
              </button>
            </div>

            {supported ? (
              <>
                <video
                  ref={video}
                  className="aspect-[4/3] w-full rounded-2xl bg-black object-cover"
                  muted
                  playsInline
                />
                <p className="mt-2 text-center text-xs font-medium text-[var(--ink-soft)]">
                  {busy ? "Looking it up…" : "Point at the barcode"}
                </p>
              </>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void submit(manual.trim());
                }}
              >
                <p className="mb-2 text-xs leading-relaxed font-medium text-[var(--ink-soft)]">
                  This browser has no barcode reader — Safari is the usual
                  culprit. Type the number under the bars and you still get the
                  exact figures off the label.
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
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
