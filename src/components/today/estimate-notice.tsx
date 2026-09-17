import Link from "next/link";

import type { FoodEntry } from "@/lib/schemas";

/**
 * Says when today's numbers came from the offline estimator rather than the
 * model.
 *
 * Previously the only signal was a toast that vanished, so the difference
 * between a good reading and a keyword guess looked like the app being
 * randomly unreliable. It is not random, and there are two quite different
 * reasons: no key saved, which the person can fix in a minute, or the model
 * could not be reached, usually a rate limit. Saying which is the difference
 * between a known limitation and a broken app.
 */
export function EstimateNotice({
  entries,
  hasAi,
}: {
  entries: FoodEntry[];
  hasAi: boolean;
}) {
  if (!hasAi) {
    return (
      <Link
        href="/profile#ai"
        className="sticker-flat tappable mb-3 flex items-center gap-3 px-4 py-3"
      >
        <span className="text-xl leading-none" aria-hidden>
          🧠
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm leading-tight font-bold">
            Momo is guessing from a food table
          </span>
          <span className="mt-0.5 block text-xs leading-relaxed font-medium text-[var(--ink-soft)]">
            Add your free Gemini key for real readings and photo logging.
          </span>
        </span>
        <span className="text-sm font-bold text-[var(--violet)]" aria-hidden>
          Add →
        </span>
      </Link>
    );
  }

  const guessed = entries.filter((e) => e.source === "estimator");
  if (!guessed.length) return null;

  return (
    <div className="sticker-flat mb-3 flex items-start gap-3 px-4 py-3">
      <span className="text-xl leading-none" aria-hidden>
        🤔
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-tight font-bold">
          {guessed.length === 1 ? "One item was" : `${guessed.length} items were`}{" "}
          guessed offline
        </p>
        <p className="mt-0.5 text-xs leading-relaxed font-medium text-[var(--ink-soft)]">
          Momo&rsquo;s AI could not be reached, so these came from the built-in
          estimator and are rough. Tap{" "}
          <span className="font-bold">GUESS · RETRY</span> on one to have the AI
          another go, or the pencil to set the numbers yourself — Momo remembers
          what you tell it.
        </p>
      </div>
    </div>
  );
}
