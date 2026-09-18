import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * The pieces every loading screen is built from.
 *
 * The rule these follow: a skeleton stands in a real card, at the real card's
 * size. The old loading screen was one generic stack of grey boxes shown for
 * every tab, so the moment the data arrived the page rearranged itself — the
 * skeleton was itself a source of jumping. These mirror the page they belong
 * to, down to the heights that differ between a phone and a desktop.
 *
 * All of it is `aria-hidden`; the wrapper carries one "Loading" label so a
 * screen reader hears that once instead of a hundred empty shapes.
 */

/** One placeholder block: a pill of the groove colour that breathes. */
export function Line({ className }: { className?: string }) {
  return <span aria-hidden className={cn("skeleton block h-3.5 w-24", className)} />;
}

/** A round one — an emoji, an avatar, the jar. */
export function Dot({ size, className }: { size: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("skeleton block shrink-0", className)}
      style={{ width: size, height: size }}
    />
  );
}

/** The sticker surface, empty. Same shadow and radius as the real thing. */
export function Card({
  children,
  className,
  inset = true,
}: {
  children?: ReactNode;
  className?: string;
  inset?: boolean;
}) {
  return (
    <div aria-hidden className={cn("sticker", inset && "p-5 sm:p-6", className)}>
      {children}
    </div>
  );
}

/** Emoji, title and hint, laid out like StickerHeading. */
export function Heading({ hint = true }: { hint?: boolean }) {
  return (
    <div className="mb-4 flex items-start gap-2.5">
      <Dot size={20} className="mt-0.5 rounded-lg" />
      <div className="min-w-0 flex-1">
        <Line className="h-4 w-40 sm:h-5" />
        {hint ? <Line className="mt-2 h-3 w-28" /> : null}
      </div>
    </div>
  );
}

/**
 * The page title block that opens every screen.
 *
 * `lines` is how many lines the real title takes on a phone — Today greets
 * you across two of them — and `meta` is the smaller line under it that You
 * carries. Both exist so the first card below the header starts at the same
 * height in the skeleton as in the page.
 */
export function PageHeader({
  momo = false,
  lines = 1,
  meta = false,
}: {
  momo?: boolean;
  lines?: 1 | 2;
  meta?: boolean;
}) {
  return (
    <header className="flex items-center gap-3">
      {momo ? <Dot size={60} className="rounded-full" /> : null}
      <div className="min-w-0 flex-1">
        <Line className="h-3 w-24" />
        <Line className="mt-2.5 h-7 w-56 max-w-full sm:h-8" />
        {lines === 2 ? <Line className="mt-2 h-7 w-44 sm:hidden" /> : null}
        {meta ? <Line className="mt-2.5 h-3 w-48 max-w-full" /> : null}
      </div>
    </header>
  );
}

/** A row of text: a couple of lines of differing length. */
export function Paragraph({ lines = 2 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }, (_, i) => (
        <Line key={i} className={cn("h-3", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

/** A meter: emoji, label, and the bar it fills. */
export function MeterRow() {
  return (
    <div className="flex items-center gap-3">
      <Dot size={36} className="rounded-2xl" />
      <div className="min-w-0 flex-1">
        <Line className="h-3 w-20" />
        <Line className="mt-2 h-3 w-full" />
      </div>
    </div>
  );
}

/** Wraps a whole loading screen: the fade delay, and the one spoken label. */
export function LoadingPage({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading"
      className="skeleton-page space-y-4 sm:space-y-5"
    >
      {children}
    </div>
  );
}
