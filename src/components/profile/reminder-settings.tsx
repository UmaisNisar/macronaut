"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Haptic } from "@/components/ui/haptic";
import { Squiggle } from "@/components/kit";
import {
  removePushSubscriptionAction,
  saveReminderSettingsAction,
  savePushSubscriptionAction,
} from "@/server/actions";

/**
 * One notification, at an hour you pick, only on days you have logged nothing.
 *
 * Permission is requested from a button press and never on load: a page that
 * demands notification access the moment it opens is the reason people block
 * notifications for everything.
 *
 * On iOS this only works once the app is on the home screen — Safari does not
 * allow push from a browser tab — so it says so rather than failing silently.
 */

/**
 * The push API wants raw bytes, not the base64url the key is published as.
 * Typed as ArrayBuffer because a Uint8Array over a possibly-shared buffer does
 * not satisfy BufferSource.
 */
function urlBase64ToBytes(base64: string): ArrayBuffer {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

const HOURS = [7, 12, 18, 19, 20, 21, 22];

export function ReminderSettings({
  publicKey,
  initialHour,
}: {
  publicKey: string;
  initialHour: number | null;
}) {
  const [hour, setHour] = useState<number | null>(initialHour);
  const [pending, start] = useTransition();

  const label = (h: number) =>
    `${((h + 11) % 12) + 1}${h < 12 ? "am" : "pm"}`;

  async function enable(nextHour: number) {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast.error("This browser cannot do reminders.", {
        description:
          "On an iPhone, add Macronaut to your home screen first — Safari does not allow it from a tab.",
      });
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      toast("No reminders then", {
        description: "You can turn them on any time from here.",
      });
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    let sub = await registration.pushManager.getSubscription();
    if (!sub) {
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBytes(publicKey),
      });
    }

    const json = sub.toJSON();
    start(async () => {
      const saved = await savePushSubscriptionAction({
        endpoint: sub!.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
      });
      if (!saved.ok) {
        toast.error(saved.error);
        return;
      }
      const result = await saveReminderSettingsAction({
        reminderHour: nextHour,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setHour(nextHour);
      toast.success(`Momo will nudge you at ${label(nextHour)}`, {
        description: "Only on days you have not logged anything.",
      });
    });
  }

  function disable() {
    start(async () => {
      const registration = await navigator.serviceWorker.ready.catch(() => null);
      const sub = await registration?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscriptionAction(sub.endpoint);
        await sub.unsubscribe().catch(() => {});
      }
      await saveReminderSettingsAction({ reminderHour: null });
      setHour(null);
      toast("Reminders off");
    });
  }

  return (
    <>
      <Squiggle />
      <p className="mb-1 text-sm font-bold">Evening nudge</p>
      <p className="mb-3 text-xs leading-relaxed font-medium text-[var(--ink-soft)]">
        {hour === null
          ? "One notification, only on days you have logged nothing at all."
          : `On for ${label(hour)}. Only fires if the day is still empty.`}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {HOURS.map((h) => (
          <Haptic key={h}>
            <button
              type="button"
              disabled={pending}
              onClick={() => void enable(h)}
              className="sticker-flat tappable rounded-full px-3.5 py-2 text-xs font-bold disabled:opacity-50"
              style={
                hour === h
                  ? { background: "var(--violet)", color: "#fff" }
                  : undefined
              }
              aria-pressed={hour === h}
            >
              {label(h)}
            </button>
          </Haptic>
        ))}

        {hour !== null ? (
          <Button size="sm" variant="ghost" onClick={disable} disabled={pending}>
            Turn off
          </Button>
        ) : null}
      </div>
    </>
  );
}
