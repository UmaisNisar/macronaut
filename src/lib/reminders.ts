/**
 * Time maths for the reminder job.
 *
 * Extracted from the cron route so it can be tested. "Send at 8pm" is the kind
 * of requirement that looks trivial and quietly breaks across a time zone, a
 * date boundary, or daylight saving.
 */

/** What hour is it for this person right now? Null for an unusable zone. */
export function localHour(timeZone: string, now: Date): number | null {
  try {
    const hour = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "numeric",
      hour12: false,
    }).format(now);
    const n = Number(hour);
    return Number.isFinite(n) ? n % 24 : null;
  } catch {
    // An unknown zone should skip that person, not fail the whole run.
    return null;
  }
}

/** Their calendar day, which is what "logged today" has to mean. */
export function localDate(timeZone: string, now: Date): string | null {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return null;
  }
}

/** Is now the moment to nudge this person? */
export function isReminderDue(
  timeZone: string,
  reminderHour: number,
  now: Date,
): boolean {
  return localHour(timeZone, now) === reminderHour;
}
