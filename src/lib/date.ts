/**
 * Every day-scoped record in Macronaut is keyed by a plain `YYYY-MM-DD` string
 * in the *user's own* local timezone. The client decides what "today" means and
 * sends it along; the server never guesses from UTC unless it has nothing else.
 */

export type Iso = string;

const DAY_MS = 86_400_000;

export function toIso(date: Date): Iso {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Local midnight for an ISO day — safe for arithmetic and formatting. */
export function fromIso(iso: Iso): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function todayIso(): Iso {
  return toIso(new Date());
}

export function isValidIso(value: unknown): value is Iso {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  // Shape alone accepts "2026-13-45" and "2026-02-30", which then become an
  // Invalid Date downstream and render as NaN. Round-tripping through Date
  // proves the day actually exists: anything that rolls over comes back
  // different from what went in.
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function addDays(iso: Iso, days: number): Iso {
  const d = fromIso(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function diffDays(a: Iso, b: Iso): number {
  return Math.round((fromIso(b).getTime() - fromIso(a).getTime()) / DAY_MS);
}

/** Inclusive list of days, oldest first. */
export function rangeIso(startIso: Iso, endIso: Iso): Iso[] {
  const out: Iso[] = [];
  const total = diffDays(startIso, endIso);
  for (let i = 0; i <= total; i++) out.push(addDays(startIso, i));
  return out;
}

/** The `n` days ending on `endIso` (inclusive), oldest first. */
export function lastNDays(endIso: Iso, n: number): Iso[] {
  return rangeIso(addDays(endIso, -(n - 1)), endIso);
}

/** Monday-based week start. */
export function startOfWeek(iso: Iso): Iso {
  const d = fromIso(iso);
  const shift = (d.getDay() + 6) % 7;
  return addDays(iso, -shift);
}

export function startOfMonth(iso: Iso): Iso {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: Iso): Iso {
  const d = fromIso(iso);
  return toIso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function monthLabel(iso: Iso): string {
  return fromIso(iso).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function addMonths(iso: Iso, months: number): Iso {
  const d = fromIso(iso);
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const lastDay = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0,
  ).getDate();
  target.setDate(Math.min(d.getDate(), lastDay));
  return toIso(target);
}

/**
 * A 6x7 grid of ISO days covering the month that `iso` falls in, padded with
 * neighbouring days so the calendar never reflows between months.
 */
export function monthGrid(iso: Iso): Iso[] {
  const first = startOfMonth(iso);
  const gridStart = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

export function isSameMonth(a: Iso, b: Iso): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/** "Today" / "Yesterday" / "Sat 12 Apr" — relative where it helps, dated where it does not. */
export function relativeDayLabel(iso: Iso, today: Iso = todayIso()): string {
  const delta = diffDays(iso, today);
  if (delta === 0) return "Today";
  if (delta === 1) return "Yesterday";
  if (delta === -1) return "Tomorrow";
  if (delta > 1 && delta < 7) return `${delta} days ago`;
  return fromIso(iso).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function longDayLabel(iso: Iso): string {
  return fromIso(iso).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function shortDayLabel(iso: Iso): string {
  return fromIso(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

export function weekdayInitial(iso: Iso): string {
  return fromIso(iso).toLocaleDateString(undefined, { weekday: "narrow" });
}

export const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];
