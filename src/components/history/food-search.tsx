"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";

import { searchFoodAction } from "@/server/actions";
import { relativeDayLabel } from "@/lib/date";
import type { FoodEntry } from "@/lib/schemas";
import type { Iso } from "@/lib/date";

/**
 * Find a meal in your own history.
 *
 * The journal could only be browsed a day at a time, which is fine for last
 * Tuesday and useless for "when did I last have this" once there are months of
 * it. Results link straight to the day they happened on.
 *
 * Searching on submit rather than on every keystroke: each one is a database
 * query, and nobody needs results for "p", "po", "por".
 */
export function FoodSearch({ today }: { today: Iso }) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<FoodEntry[] | null>(null);
  const [pending, start] = useTransition();

  function run(event: React.FormEvent) {
    event.preventDefault();
    const query = term.trim();
    if (query.length < 2) return;
    start(async () => {
      const found = await searchFoodAction(query);
      setResults(found.ok ? found.entries : []);
    });
  }

  function clear() {
    setTerm("");
    setResults(null);
  }

  return (
    <div className="mb-4">
      <form onSubmit={run} className="flex gap-2">
        <div className="field flex flex-1 items-center gap-2 rounded-full bg-[var(--inset)] px-4 py-2.5">
          <Search className="size-4 shrink-0 text-[var(--ink-soft)]" aria-hidden />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Find a meal you've had before…"
            aria-label="Search your food history"
            className="w-full bg-transparent text-[1rem] font-medium outline-none placeholder:text-[var(--ink-soft)]/70"
          />
          {term ? (
            <button
              type="button"
              onClick={clear}
              aria-label="Clear search"
              className="shrink-0 text-[var(--ink-soft)] hover:text-[var(--ink)]"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      </form>

      {pending ? (
        <p className="mt-2 px-1 text-xs font-semibold text-[var(--ink-soft)]">
          Looking…
        </p>
      ) : null}

      {results && !pending ? (
        results.length === 0 ? (
          <p className="mt-2 px-1 text-xs font-medium text-[var(--ink-soft)]">
            Nothing matching “{term.trim()}” in your log yet.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {results.map((entry) => (
              <li key={entry.id}>
                <Link
                  href={`/history?d=${entry.logDate}`}
                  className="sticker-flat tappable flex items-center gap-3 px-3.5 py-2.5"
                >
                  <span className="text-lg leading-none" aria-hidden>
                    {entry.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">
                      {entry.name}
                    </span>
                    <span className="block text-xs font-medium text-[var(--ink-soft)]">
                      {relativeDayLabel(entry.logDate, today)} · {entry.quantity}
                    </span>
                  </span>
                  <span className="numeral shrink-0 text-sm text-[var(--peach)]">
                    {Math.round(entry.calories)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
