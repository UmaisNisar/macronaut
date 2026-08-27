"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { Haptic } from "@/components/ui/haptic";
import { Momo } from "@/components/mascot/momo";
import { isIosTouch } from "@/lib/haptics";
import { EASE } from "@/lib/motion";

/**
 * "Put this on your home screen."
 *
 * Two very different mechanisms, because the platforms are not equal here:
 *
 * - Chrome (Android, desktop) fires `beforeinstallprompt`, which we capture and
 *   replay from a button. That is a genuine one-tap install.
 * - Safari has never implemented it, and there is no API on iOS that can add an
 *   app to the home screen. All anyone can do there is describe the Share menu,
 *   so that is what we do rather than pretend there is a button.
 *
 * Nothing shows if the app is already installed, or once it has been dismissed.
 */

const DISMISS_KEY = "macronaut:install-dismissed";

/** Chrome-only, hence not in lib.dom. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function alreadyInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari's own flag for a home-screen launch.
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (alreadyInstalled() || wasDismissed()) return;

    // Chrome tells us when the app qualifies; we hold the event and use it later.
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as InstallPromptEvent);
      setOpen(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // Safari never fires it, so iOS is detected rather than announced.
    if (isIosTouch()) {
      setShowIos(true);
      setOpen(true);
    }

    const onInstalled = () => setOpen(false);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Private mode: it will ask again next time, which is acceptable.
    }
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    // The event is single-use; Chrome will fire a fresh one if still eligible.
    setDeferred(null);
    setOpen(false);
  }, [deferred]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ duration: 0.3, ease: EASE.glide }}
        className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] lg:left-auto lg:max-w-sm"
        role="dialog"
        aria-label="Install Macronaut"
      >
        <div className="sticker tint-violet flex items-start gap-3 p-4">
          <Momo mood="excited" size={52} bare />

          <div className="min-w-0 flex-1">
            <p className="text-sm leading-tight font-bold">
              Keep Momo on your home screen
            </p>

            {showIos ? (
              <p className="mt-1 text-xs leading-relaxed font-medium text-[var(--ink-soft)]">
                Tap{" "}
                <ShareGlyph />{" "}
                <span className="font-bold">Share</span> at the bottom of Safari,
                then <span className="font-bold">Add to Home Screen</span>.
              </p>
            ) : (
              <p className="mt-1 text-xs leading-relaxed font-medium text-[var(--ink-soft)]">
                Opens full screen, loads faster, and works like a real app.
              </p>
            )}

            <div className="mt-3 flex items-center gap-2">
              {showIos ? (
                <Haptic>
                  <Button size="sm" onClick={dismiss}>
                    Got it
                  </Button>
                </Haptic>
              ) : (
                <Haptic>
                  <Button size="sm" onClick={install}>
                    <span aria-hidden>📲</span> Add to home screen
                  </Button>
                </Haptic>
              )}
              <Button size="sm" variant="ghost" onClick={dismiss}>
                Not now
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/** Safari's share icon, so the instruction points at something recognisable. */
function ShareGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="inline-block size-3.5 -translate-y-px"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 15V3m0 0L8 7m4-4 4 4" />
      <path d="M4 13v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}
