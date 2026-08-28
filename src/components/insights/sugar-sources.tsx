import { Sticker, StickerHeading } from "@/components/kit";
import type { SugarSource } from "@/lib/insights";

/**
 * What the sugar actually came from.
 *
 * The average on its own is a number you can do nothing with. Naming the four
 * or five foods behind most of it is the part that changes a shopping list —
 * and it is usually a surprise, because the biggest contributor is rarely the
 * one that felt like a treat.
 *
 * No judgement in the copy. This is *total* sugars, so a person eating fruit
 * and yoghurt can top this list while doing nothing wrong, and the card says
 * so rather than letting the ranking imply otherwise.
 */
export function SugarSources({
  sources,
  avgSugar,
  ceiling,
  daysOver,
  daysLogged,
  days,
}: {
  sources: SugarSource[];
  avgSugar: number;
  ceiling: number;
  daysOver: number;
  daysLogged: number;
  days: number;
}) {
  if (!sources.length) {
    return (
      <Sticker tint="berry">
        <StickerHeading emoji="🍬" title="Where your sugar came from" />
        <p className="mt-1 text-sm leading-relaxed font-medium text-[var(--ink-soft)]">
          Nothing with sugar in it logged over the last {days} days — or not
          enough detail to tell yet. Keep logging and this fills itself in.
        </p>
      </Sticker>
    );
  }

  const over = ceiling > 0 && avgSugar > ceiling;

  return (
    <Sticker tint="berry">
      <StickerHeading
        emoji="🍬"
        title="Where your sugar came from"
        hint={`last ${days} days`}
      />

      <div className="mb-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span
          className="numeral text-3xl leading-none"
          style={{ color: over ? "var(--peach)" : "var(--ink)" }}
        >
          {avgSugar} g
        </span>
        <span className="text-sm font-semibold text-[var(--ink-soft)]">
          a day
          {ceiling > 0 ? ` against a ${ceiling} g ceiling` : ""}
        </span>
        {daysOver > 0 ? (
          <span className="ml-auto shrink-0 rounded-full bg-[var(--inset)] px-3 py-1 text-xs font-bold text-[var(--ink-soft)]">
            over on {daysOver} of {daysLogged}
          </span>
        ) : null}
      </div>

      <ol className="space-y-2.5">
        {sources.map((source) => (
          <li key={source.name} className="flex items-center gap-3">
            <span className="shrink-0 text-xl leading-none" aria-hidden>
              {source.emoji}
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-bold">
                  {source.name}
                </span>
                <span className="numeral shrink-0 text-sm">
                  {source.sugar} g
                </span>
              </span>

              {/* Share of the window's sugar, so the ranking has a sense of
                  scale rather than being a bare ordering. */}
              <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-[var(--inset)]">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${Math.max(4, Math.round(source.share * 100))}%`,
                    background: "var(--berry)",
                  }}
                />
              </span>

              <span className="mt-1 block text-[0.7rem] font-medium text-[var(--ink-soft)]">
                {Math.round(source.share * 100)}% of your sugar
                {source.times > 1 ? ` · ${source.times} times` : ""}
              </span>
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-4 rounded-2xl bg-[var(--inset)] px-3.5 py-3 text-xs leading-relaxed font-medium text-[var(--ink-soft)]">
        These are <strong className="font-bold">total</strong> sugars, so the
        fruit in your porridge and the lactose in milk are counted here
        alongside anything added. A high number is worth understanding, not
        worth panicking about.
      </p>
    </Sticker>
  );
}
