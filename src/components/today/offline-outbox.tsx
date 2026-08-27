"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";

import {
  listQueued,
  removeQueued,
  type PendingLog,
} from "@/lib/offline-queue";
import { logFoodAction, logFoodPhotoAction } from "@/server/actions";
import { EASE } from "@/lib/motion";

/**
 * Shows what is waiting to be sent, and sends it the moment we are back.
 *
 * Flushing is strictly sequential. Each queued meal is its own model call and
 * its own recompute of the day, and firing five at once would race the daily
 * rollup against itself. Slower and correct beats fast and wrong.
 *
 * An item is only removed once the server has accepted it. A failure leaves it
 * in the outbox for the next attempt rather than silently dropping someone's
 * dinner.
 */
export function OfflineOutbox() {
  const router = useRouter();
  const [pending, setPending] = useState<PendingLog[]>([]);
  const [sending, setSending] = useState(false);
  /** Synchronous re-entry latch. See flush(). */
  const flushing = useRef(false);

  const refresh = useCallback(async () => {
    setPending(await listQueued());
  }, []);

  const drain = useCallback(async () => {
    const queue = await listQueued();
    if (!queue.length) return;

    setSending(true);
    let sent = 0;
    for (const item of queue) {
      const result =
        item.kind === "text"
          ? await logFoodAction({ text: item.text, date: item.date })
          : await logFoodPhotoAction({
              imageBase64: item.imageBase64,
              mimeType: item.mimeType,
              date: item.date,
              note: item.note,
            });

      if (!result.ok) break; // still offline, or the server said no — try later
      await removeQueued(item.id);
      sent++;
      await refresh();
    }
    setSending(false);

    if (sent > 0) {
      toast.success(
        sent === 1 ? "Synced the meal you logged offline" : `Synced ${sent} offline meals`,
      );
      router.refresh();
    }
  }, [refresh, router]);

  const flush = useCallback(async () => {
    // A ref, not the `sending` state, because state updates are asynchronous:
    // two triggers in the same tick (the browser's own `online` event plus a
    // mount flush, say) would both read `sending === false`, both drain the
    // whole queue, and every meal would be logged twice. A ref flips
    // synchronously, so the second caller genuinely sees the first.
    if (flushing.current) return;
    if (typeof navigator === "undefined" || !navigator.onLine) return;

    flushing.current = true;
    try {
      await drain();
    } finally {
      flushing.current = false;
    }
  }, [drain]);

  useEffect(() => {
    // Both of these only touch state after awaiting IndexedDB, so nothing is
    // set during the effect itself. The lint rule cannot see through the async
    // boundary, hence the scoped disable rather than a restructure that would
    // make the read-then-send flow harder to follow.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    void flush();

    const onOnline = () => void flush();
    const onQueued = () => void refresh();
    window.addEventListener("online", onOnline);
    // The composer fires this after queueing, so the strip appears at once.
    window.addEventListener("macronaut:queued", onQueued);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("macronaut:queued", onQueued);
    };
    // Deliberately mount-only: flush/refresh are stable callbacks and re-running
    // this on every render would re-flush the queue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AnimatePresence>
      {pending.length ? (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.25, ease: EASE.glide }}
          className="mb-3 overflow-hidden"
        >
          <div className="sticker-flat flex items-center gap-3 px-4 py-3">
            <span className="text-xl leading-none" aria-hidden>
              {sending ? "🔄" : "📥"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-tight font-bold">
                {sending
                  ? "Sending your offline meals…"
                  : `${pending.length} meal${pending.length > 1 ? "s" : ""} waiting to send`}
              </p>
              <p className="mt-0.5 truncate text-xs font-medium text-[var(--ink-soft)]">
                {sending
                  ? "Hang on a moment."
                  : "Saved on this device. They will go up as soon as you have signal."}
              </p>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
