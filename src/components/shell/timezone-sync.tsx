"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Tells the server which calendar day the user is actually in. Runs once, only
 * refreshes when the stored zone is wrong, so it costs nothing on repeat views.
 */
export function TimezoneSync() {
  const router = useRouter();

  useEffect(() => {
    let zone: string;
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!zone) return;

    const current = document.cookie
      .split("; ")
      .find((c) => c.startsWith("mn_tz="))
      ?.slice(6);

    if (current === encodeURIComponent(zone)) return;

    document.cookie = `mn_tz=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [router]);

  return null;
}
