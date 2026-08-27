import { Squiggle } from "@/components/kit";
import { relativeDayLabel } from "@/lib/date";
import type { Iso } from "@/lib/date";
import type { LoggedError } from "@/lib/db/store";

/**
 * The crashes the app has recorded, where you can actually see them.
 *
 * Capturing errors into a table and then providing no way to read them is half
 * a feature — it would mean querying Postgres by hand to find out why something
 * broke on a phone. This is deliberately plain: a list, newest first, hidden
 * entirely when there is nothing wrong.
 *
 * `ai-fallback` entries are the useful ones day to day. They mean the model
 * call failed and the app quietly answered from the built-in estimator, which
 * is exactly the degradation that used to be invisible.
 */

const KIND_LABEL: Record<string, string> = {
  "ai-fallback": "AI unavailable — used the offline estimator",
  "ai-photo-failed": "Photo could not be read",
  render: "A screen failed to draw",
  uncaught: "Unexpected error",
  "unhandled-rejection": "Background task failed",
};

export function ErrorLog({
  errors,
  today,
}: {
  errors: LoggedError[];
  today: Iso;
}) {
  if (!errors.length) return null;

  return (
    <>
      <Squiggle />
      <details>
        <summary className="cursor-pointer text-sm font-bold">
          Recent hiccups{" "}
          <span className="numeral ml-1 rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs text-[var(--ink-soft)]">
            {errors.length}
          </span>
        </summary>

        <p className="mt-2 text-xs leading-relaxed font-medium text-[var(--ink-soft)]">
          Things that went wrong recently. Nothing here needs action from you —
          it exists so a problem on your phone is not invisible.
        </p>

        <ul className="mt-3 space-y-1.5">
          {errors.map((error) => (
            <li
              key={error.id}
              className="rounded-2xl bg-[var(--inset)] px-3.5 py-2.5"
            >
              <p className="text-xs font-bold">
                {KIND_LABEL[error.kind] ?? error.kind}
              </p>
              <p className="mt-0.5 text-xs font-medium break-words text-[var(--ink-soft)]">
                {error.message}
              </p>
              <p className="label-cute mt-1 text-[0.5rem]">
                {relativeDayLabel(error.createdAt.slice(0, 10), today)}
                {error.path ? ` · ${error.path}` : ""}
              </p>
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
