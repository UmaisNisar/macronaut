"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { undoLogAction } from "@/server/actions";
import type { FoodEntry } from "@/lib/schemas";
import type { Iso } from "@/lib/date";

/**
 * Taking back the thing you just logged.
 *
 * Logging is deliberately one tap, and the model is sometimes wrong, so the
 * cost of a mistake was: notice it, scroll to the item, open it, delete it.
 * That is four steps to fix something that took one, which quietly teaches
 * people to check before they tap — the opposite of what a one-tap log is for.
 *
 * Two surfaces, because the app has two shapes of confirmation. Where a card
 * already appears saying what was logged, undo belongs in it. Where nothing
 * appears — a repeat chip, a scanned barcode — a toast is the only place to
 * put it.
 */

/** How long the offer stands. Long enough to read the card, short enough to go. */
const WINDOW_MS = 9000;

function describe(entries: FoodEntry[]): string {
  if (entries.length === 1) return entries[0].name;
  return `${entries.length} items`;
}

export function useUndoLog() {
  const router = useRouter();
  const [undoing, setUndoing] = useState(false);

  const undo = useCallback(
    async (entries: FoodEntry[], date: Iso): Promise<boolean> => {
      if (!entries.length || undoing) return false;
      setUndoing(true);

      const result = await undoLogAction({
        ids: entries.map((e) => e.id),
        date,
      });
      setUndoing(false);

      if (!result.ok) {
        toast.error(result.error);
        return false;
      }

      toast(`Took back ${describe(entries)}`);
      router.refresh();
      return true;
    },
    [router, undoing],
  );

  return { undo, undoing };
}

/**
 * Offer undo from a toast, for logs that produce no card of their own.
 *
 * Sonner is used rather than something inline because these fire from a
 * horizontally scrolling strip and from a camera sheet, neither of which has
 * anywhere to put a message without moving the thing under your thumb.
 */
export function useUndoToast() {
  const { undo } = useUndoLog();

  return useCallback(
    (entries: FoodEntry[], date: Iso) => {
      if (!entries.length) return;

      toast(`Added ${describe(entries)}`, {
        duration: WINDOW_MS,
        description:
          entries.length === 1
            ? `${Math.round(entries[0].calories)} kcal`
            : `${Math.round(entries.reduce((a, e) => a + e.calories, 0))} kcal in total`,
        action: {
          label: "Undo",
          onClick: () => {
            void undo(entries, date);
          },
        },
      });
    },
    [undo],
  );
}
