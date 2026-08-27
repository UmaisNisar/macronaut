"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { ChevronDown, Loader2, Pencil, Trash2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyNest } from "@/components/kit";
import { MEAL_SLOTS, type FoodEntry, type MealSlot } from "@/lib/schemas";
import type { Iso } from "@/lib/date";
import { deleteFoodAction, updateFoodAction } from "@/server/actions";
import { SPRING } from "@/lib/motion";
import { useIsTouch } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

const MEAL_META: Record<
  MealSlot,
  { label: string; emoji: string; color: string; soft: string }
> = {
  breakfast: {
    label: "Breakfast",
    emoji: "🌅",
    color: "var(--peach)",
    soft: "var(--peach-soft)",
  },
  lunch: {
    label: "Lunch",
    emoji: "☀️",
    color: "var(--sun)",
    soft: "var(--sun-soft)",
  },
  dinner: {
    label: "Dinner",
    emoji: "🌙",
    color: "var(--violet)",
    soft: "var(--violet-soft)",
  },
  snack: {
    label: "Snacks",
    emoji: "🍪",
    color: "var(--violet)",
    soft: "var(--violet-soft)",
  },
  drink: {
    label: "Sips",
    emoji: "🥤",
    color: "var(--sky)",
    soft: "var(--sky-soft)",
  },
};

const CONFIDENCE = {
  high: { dot: "var(--mint)", copy: "Confident guess" },
  medium: { dot: "var(--sun)", copy: "Standard portion assumed" },
  low: { dot: "var(--peach)", copy: "Rough guess — tap to fix" },
} as const;

export function MealTimeline({
  entries,
  date,
  editable = true,
}: {
  entries: FoodEntry[];
  date: Iso;
  editable?: boolean;
}) {
  const [editing, setEditing] = useState<FoodEntry | null>(null);

  const grouped = useMemo(
    () =>
      MEAL_SLOTS.map((meal) => ({
        meal,
        items: entries.filter((e) => e.meal === meal),
      })).filter((g) => g.items.length > 0),
    [entries],
  );

  if (!entries.length) {
    return (
      <EmptyNest mood="curious" title="Nothing here yet!">
        Tell Momo what you ate and it&rsquo;ll fill this page with little food
        stickers.
      </EmptyNest>
    );
  }

  return (
    <>
      <div className="space-y-5">
        {grouped.map(({ meal, items }, groupIndex) => {
          const meta = MEAL_META[meal];
          const kcal = items.reduce((a, e) => a + e.calories, 0);

          return (
            <section key={meal}>
              <header className="mb-2.5 flex items-center gap-2">
                <span
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold"
                  style={{ background: meta.soft }}
                >
                  <span aria-hidden>{meta.emoji}</span>
                  {meta.label}
                </span>
                <span className="h-[3px] flex-1 rounded-full bg-[var(--muted)]" />
                <span className="numeral text-sm text-[var(--ink-soft)]">
                  {Math.round(kcal).toLocaleString()} kcal
                </span>
              </header>

              <ul className="space-y-2">
                <AnimatePresence initial={false}>
                  {items.map((entry, i) => (
                    <FoodSticker
                      key={entry.id}
                      entry={entry}
                      date={date}
                      editable={editable}
                      index={groupIndex * 3 + i}
                      onEdit={() => setEditing(entry)}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            </section>
          );
        })}
      </div>

      <EditDialog entry={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function FoodSticker({
  entry,
  date,
  editable,
  index,
  onEdit,
}: {
  entry: FoodEntry;
  date: Iso;
  editable: boolean;
  index: number;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const isTouch = useIsTouch();
  const meta = MEAL_META[entry.meal];
  const confidence = CONFIDENCE[entry.confidence];

  function remove() {
    startTransition(async () => {
      const result = await deleteFoodAction(entry.id, date);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast(`Bye bye, ${entry.name} 👋`);
      router.refresh();
    });
  }

  return (
    <motion.li
      layout
      initial={{ opacity: 0, scale: 0.9, y: -6 }}
      animate={{ opacity: pending ? 0.4 : 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.85, height: 0, marginTop: 0 }}
      transition={{ ...SPRING.pop, delay: Math.min(index * 0.04, 0.3) }}
      whileHover={isTouch ? undefined : { y: -3, rotate: index % 2 ? -0.7 : 0.7 }}
      className="sticker-flat group px-3 py-2.5"
      style={{ ["--lip" as string]: meta.soft }}
    >
      <div className="flex items-center gap-3">
        <span
          className="grid size-11 shrink-0 place-items-center rounded-2xl text-xl"
          style={{ background: meta.soft }}
          aria-hidden
        >
          {entry.emoji}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <p className="text-sm font-bold">{entry.name}</p>
            <p className="text-xs font-medium text-[var(--ink-soft)]">
              {entry.quantity}
            </p>
            <span
              className="size-1.5 rounded-full"
              style={{ background: confidence.dot }}
              title={confidence.copy}
              aria-label={confidence.copy}
            />
          </div>

          <div className="mt-1 flex flex-wrap gap-1">
            <MacroChip label="P" value={entry.protein} color="var(--mint)" />
            <MacroChip label="C" value={entry.carbs} color="var(--sky)" />
            <MacroChip label="F" value={entry.fat} color="var(--sun)" />
            {entry.fiber > 0 ? (
              <MacroChip label="Fib" value={entry.fiber} color="var(--leaf)" />
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <span className="numeral mr-1 text-base text-[var(--peach)]">
            {Math.round(entry.calories)}
          </span>
          {editable ? (
            <>
              <button
                type="button"
                onClick={onEdit}
                className="grid size-10 place-items-center rounded-full text-[var(--ink-soft)] transition-all hover:bg-[var(--muted)] hover:text-[var(--violet)] active:scale-90 sm:size-8"
                aria-label={`Edit ${entry.name}`}
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className="grid size-10 place-items-center rounded-full text-[var(--ink-soft)] transition-all hover:bg-[var(--muted)] hover:text-[var(--destructive)] active:scale-90 sm:size-8"
                aria-label={`Remove ${entry.name}`}
              >
                {pending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
              </button>
            </>
          ) : null}
        </div>
      </div>

      {entry.assumptions.length > 0 ? (
        <div className="mt-1.5 pl-14">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="label-cute -m-1 flex items-center gap-1 p-1 text-[0.55rem] transition-colors hover:text-[var(--violet)]"
            aria-expanded={open}
          >
            <ChevronDown
              className={cn("size-3 transition-transform", open && "rotate-180")}
            />
            {entry.assumptions.length} guess
            {entry.assumptions.length > 1 ? "es" : ""}
          </button>
          <AnimatePresence initial={false}>
            {open ? (
              <motion.ul
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="overflow-hidden"
              >
                {entry.assumptions.map((a, i) => (
                  <li
                    key={i}
                    className="mt-1.5 rounded-xl bg-[var(--muted)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink-soft)]"
                  >
                    {a}
                  </li>
                ))}
              </motion.ul>
            ) : null}
          </AnimatePresence>
        </div>
      ) : null}
    </motion.li>
  );
}

function MacroChip({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <span
      className="numeral rounded-full px-1.5 py-0.5 text-[0.62rem] sm:px-2 sm:text-[0.68rem]"
      style={{
        background: `color-mix(in oklab, ${color} 16%, var(--card))`,
        color: `color-mix(in oklab, ${color} 82%, var(--ink))`,
      }}
    >
      {label} {Math.round(value * 10) / 10}g
    </span>
  );
}

function EditDialog({
  entry,
  onClose,
}: {
  entry: FoodEntry | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={Boolean(entry)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {entry ? (
          // Keyed so the uncontrolled inputs reset per entry. The key must live
          // here, not on DialogContent — remounting the popup mid-close strands
          // the dialog open.
          <form
            key={entry.id}
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              startTransition(async () => {
                const result = await updateFoodAction({
                  id: entry.id,
                  name: String(form.get("name") ?? ""),
                  quantity: String(form.get("quantity") ?? ""),
                  meal: String(form.get("meal") ?? entry.meal) as MealSlot,
                  calories: Number(form.get("calories")),
                  protein: Number(form.get("protein")),
                  carbs: Number(form.get("carbs")),
                  fat: Number(form.get("fat")),
                  fiber: Number(form.get("fiber")),
                  sugar: Number(form.get("sugar")),
                });
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                toast("Fixed it up ✨");
                onClose();
                router.refresh();
              });
            }}
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <span aria-hidden>{entry.emoji}</span>
                Fix this one up
              </DialogTitle>
            </DialogHeader>

            <div className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">What is it?</Label>
                <Input id="name" name="name" defaultValue={entry.name} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quantity">How much?</Label>
                <Input
                  id="quantity"
                  name="quantity"
                  defaultValue={entry.quantity}
                />
              </div>

              <fieldset>
                <legend className="mb-2 text-sm font-bold">When?</legend>
                <div className="flex flex-wrap gap-1.5">
                  {MEAL_SLOTS.map((slot) => (
                    <label
                      key={slot}
                      className="cursor-pointer rounded-full bg-[var(--muted)] px-3 py-2 text-xs font-bold text-[var(--ink-soft)] transition-colors has-checked:bg-[var(--violet)] has-checked:text-white"
                    >
                      <input
                        type="radio"
                        name="meal"
                        value={slot}
                        defaultChecked={entry.meal === slot}
                        className="sr-only"
                      />
                      {MEAL_META[slot].emoji} {MEAL_META[slot].label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="grid grid-cols-3 gap-2.5">
                {(
                  [
                    ["calories", "🔥 kcal", entry.calories],
                    ["protein", "💪 Protein", entry.protein],
                    ["carbs", "⚡ Carbs", entry.carbs],
                    ["fat", "🥑 Fat", entry.fat],
                    ["fiber", "🌱 Fiber", entry.fiber],
                    ["sugar", "🍬 Sugar", entry.sugar],
                  ] as const
                ).map(([name, label, value]) => (
                  <div key={name} className="space-y-1">
                    <Label htmlFor={name} className="text-[0.7rem]">
                      {label}
                    </Label>
                    <Input
                      id={name}
                      name={name}
                      type="number"
                      step="0.1"
                      min="0"
                      defaultValue={value}
                      className="numeral h-11 px-3"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Never mind
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                Save it
              </Button>
            </div>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
