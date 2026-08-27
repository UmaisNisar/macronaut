import "server-only";

import { cookies } from "next/headers";

import { toIso, type Iso } from "@/lib/date";

export const TZ_COOKIE = "mn_tz";

/**
 * The calendar day it currently is *for the user*. The browser writes its IANA
 * zone into a cookie on first load; until then we fall back to the server's own
 * clock. `en-CA` formats as YYYY-MM-DD, which is exactly our Iso shape.
 */
export async function userToday(): Promise<Iso> {
  const timeZone = (await cookies()).get(TZ_COOKIE)?.value;
  if (timeZone) {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()) as Iso;
    } catch {
      // Unknown zone in the cookie: fall through to server local time.
    }
  }
  return toIso(new Date());
}
