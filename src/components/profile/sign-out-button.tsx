"use client";

import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { signOutAction } from "@/server/actions";

/**
 * Signing out has to take the offline snapshot with it.
 *
 * The service worker keeps a copy of Today so the app opens without a
 * connection. That copy is a signed-in page, so leaving it behind would mean
 * the next person to open the app on this device sees the last one's day.
 */
export function SignOutButton() {
  return (
    <form
      action={signOutAction}
      className="mt-4"
      onSubmit={() => {
        navigator.serviceWorker?.controller?.postMessage({
          type: "clear-pages",
        });
      }}
    >
      <Button type="submit" variant="outline">
        <LogOut className="size-4" />
        Sign out
      </Button>
    </form>
  );
}
