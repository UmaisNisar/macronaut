import { describe, expect, it } from "vitest";

import { isReminderDue, localDate, localHour } from "@/lib/reminders";

/**
 * "Send at 8pm" looks trivial and quietly breaks across a time zone, a date
 * boundary, or a daylight saving change. The cron runs hourly in UTC and
 * decides per person, so this is the logic that decides whether anyone is
 * nudged at the right moment — or at 3am.
 */
describe("localHour", () => {
  it("converts a UTC instant into the local hour", () => {
    // 20:00 UTC
    const now = new Date("2026-08-27T20:00:00Z");
    expect(localHour("UTC", now)).toBe(20);
    // Toronto is UTC-4 in August.
    expect(localHour("America/Toronto", now)).toBe(16);
    // Karachi is UTC+5.
    expect(localHour("Asia/Karachi", now)).toBe(1);
  });

  it("reports midnight as 0, not 24", () => {
    expect(localHour("UTC", new Date("2026-08-27T00:00:00Z"))).toBe(0);
  });

  it("respects daylight saving rather than a fixed offset", () => {
    const summer = new Date("2026-07-01T12:00:00Z");
    const winter = new Date("2026-01-01T12:00:00Z");
    // Toronto is UTC-4 in July and UTC-5 in January.
    expect(localHour("America/Toronto", summer)).toBe(8);
    expect(localHour("America/Toronto", winter)).toBe(7);
  });

  it("skips an unusable zone instead of throwing", () => {
    expect(localHour("Not/AZone", new Date())).toBeNull();
  });
});

describe("localDate", () => {
  it("gives the person's calendar day, not the server's", () => {
    // 01:00 UTC on the 28th is still the 27th in Toronto.
    const now = new Date("2026-08-28T01:00:00Z");
    expect(localDate("UTC", now)).toBe("2026-08-28");
    expect(localDate("America/Toronto", now)).toBe("2026-08-27");
  });

  it("crosses forward for zones ahead of UTC", () => {
    const now = new Date("2026-08-27T20:00:00Z");
    expect(localDate("Asia/Karachi", now)).toBe("2026-08-28");
  });

  it("returns null for an unusable zone", () => {
    expect(localDate("Not/AZone", new Date())).toBeNull();
  });
});

describe("isReminderDue", () => {
  const at = (iso: string) => new Date(iso);

  it("fires only in the hour the person chose, in their zone", () => {
    // 8pm in Toronto is 00:00 UTC the next day.
    expect(isReminderDue("America/Toronto", 20, at("2026-08-28T00:00:00Z"))).toBe(true);
    expect(isReminderDue("America/Toronto", 20, at("2026-08-27T23:00:00Z"))).toBe(false);
  });

  it("does not fire for someone in a different zone at the same instant", () => {
    const instant = at("2026-08-28T00:00:00Z");
    expect(isReminderDue("America/Toronto", 20, instant)).toBe(true);
    expect(isReminderDue("Europe/London", 20, instant)).toBe(false);
  });

  it("fires exactly once across a day, since the job runs hourly", () => {
    const hours = Array.from({ length: 24 }, (_, h) =>
      isReminderDue("UTC", 20, at(`2026-08-27T${String(h).padStart(2, "0")}:00:00Z`)),
    );
    expect(hours.filter(Boolean)).toHaveLength(1);
  });

  it("never fires for a broken zone", () => {
    const hours = Array.from({ length: 24 }, (_, h) =>
      isReminderDue("Not/AZone", 20, at(`2026-08-27T${String(h).padStart(2, "0")}:00:00Z`)),
    );
    expect(hours.filter(Boolean)).toHaveLength(0);
  });
});
