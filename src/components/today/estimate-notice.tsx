import type { FoodEntry } from "@/lib/schemas";

/**
 * Says when today's numbers came from the offline estimator rather than the
 * model.
 *
 * Previously the only signal was a toast that vanished, so the difference
 * between a good reading and a keyword guess looked like the app being
 * randomly unreliable. It is not random — it means the model could not be
 * reached, usually a rate limit — and saying so is the difference between a
 * known limitation and a broken app.
 */
export function EstimateNotice({ entries }: { entries: FoodEntry[] }) {
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
