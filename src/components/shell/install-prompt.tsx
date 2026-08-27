"use client";

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { AnimatePresence, motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { Haptic } from "@/components/ui/haptic";
import { Momo } from "@/components/mascot/momo";
import { isIosTouch } from "@/lib/haptics";
import { useIsTouch } from "@/lib/use-media-query";
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

const noSubscribe = () => () => {};

/**
 * Browser facts that never change during a session. Read through
 * useSyncExternalStore rather than an effect: the server snapshot is a stable
 * `false`, so this hydrates cleanly, and nothing calls setState during an
 * effect just to learn what device it is running on.
 */
function useBrowserFlag(read: () => boolean): boolean {
  return useSyncExternalStore(noSubscribe, read, () => false);
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [closed, setClosed] = useState(false);
  const isTouch = useIsTouch();

  const installed = useBrowserFlag(alreadyInstalled);
  const dismissedBefore = useBrowserFlag(wasDismissed);
  const onIos = useBrowserFlag(isIosTouch);

  useEffect(() => {
    if (alreadyInstalled() || wasDismissed()) return;

    // Chrome tells us when the app qualifies; we hold the event and use it
    // later. Setting state from an event callback is exactly what effects are
    // for, unlike deriving device facts.
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as InstallPromptEvent);
    };
    const onInstalled = () => setClosed(true);

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    setClosed(true);
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
    setClosed(true);
  }, [deferred]);

  // Safari never fires beforeinstallprompt, so iOS is detected rather than
  // announced; everywhere else we wait to be told the app is installable.
  const showIos = onIos && !deferred;
  const open =
    !closed && !installed && !dismissedBefore && (showIos || deferred !== null);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ duration: 0.3, ease: EASE.glide }}
        // Clears the mobile dock, which is fixed at bottom-0 with a lower
        // z-index: anchoring this at bottom-0 too would bury the navigation
        // behind it. On desktop there is no dock, so it can sit at the edge.
        className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-50 px-3 lg:right-4 lg:bottom-4 lg:left-auto lg:max-w-sm lg:px-0"
        role="dialog"
        aria-label="Install Macronaut"
      >
        <div className="sticker tint-violet flex items-start gap-3 p-4">
          <Momo mood="excited" size={52} bare />

          <div className="min-w-0 flex-1">
            <p className="text-sm leading-tight font-bold">
              {isTouch ? "Keep Momo on your home screen" : "Install Macronaut"}
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
                {isTouch
                  ? "Opens full screen, loads faster, and works like a real app."
                  : "Opens in its own window, without the browser bar."}
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
                    <span aria-hidden>{isTouch ? "📲" : "🖥️"}</span>
                    {isTouch ? "Add to home screen" : "Install app"}
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
