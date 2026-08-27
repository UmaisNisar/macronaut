"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";

import { EASE } from "@/lib/motion";

/**
 * Says so when what you are looking at came off the device rather than the
 * server.
 *
 * The service worker keeps one snapshot of Today so the app opens with no
 * signal instead of showing a dead end. That snapshot is, by definition, as
 * old as the last time you had a connection — so it has to announce itself.
 * Anything you log while it is up goes to the outbox and sends later.
 */

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function OfflineBanner() {
  const offline = useSyncExternalStore(
    subscribe,
    () => typeof navigator !== "undefined" && navigator.onLine === false,
    () => false,
  );

  /**
   * `navigator.onLine` is not trustworthy on its own: it reports true for a
   * connection that goes nowhere, and in testing it stayed true with the
   * network cut entirely. So the browser's opinion only triggers a real check
   * — actually reaching the server is the answer.
   */
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const probe = async () => {
      try {
        await fetch("/api/ping", {
          cache: "no-store",
          signal: AbortSignal.timeout(4000),
        });
        if (!cancelled) setUnreachable(false);
      } catch {
        if (!cancelled) setUnreachable(true);
      }
    };

    // On load, and whenever the browser thinks something changed.
    const id = setTimeout(probe, 600);
    window.addEventListener("online", probe);
    window.addEventListener("offline", probe);
    return () => {
      cancelled = true;
      clearTimeout(id);
      window.removeEventListener("online", probe);
      window.removeEventListener("offline", probe);
    };
  }, []);

  const confirmed = unreachable || offline;

  return (
    <AnimatePresence>
      {confirmed ? (
        <motion.div
          initial={{ opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -8, height: 0 }}
          transition={{ duration: 0.25, ease: EASE.glide }}
          className="mb-3 overflow-hidden"
          role="status"
        >
          <div className="sticker-flat flex items-center gap-3 px-4 py-3">
            <span className="text-xl leading-none" aria-hidden>
              📴
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-tight font-bold">
                No connection — showing your last snapshot
              </p>
              <p className="mt-0.5 text-xs font-medium text-[var(--ink-soft)]">
                Numbers may be out of date. Anything you log is saved and sent
                when you are back.
              </p>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
