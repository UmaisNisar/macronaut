import { Squiggle } from "@/components/kit";

/**
 * Plain links rather than buttons with fetch-and-blob: the browser already
 * knows how to download a file from a URL, and a link keeps working with
 * middle-click, right-click "save as", and no JavaScript at all.
 */
export function ExportData() {
  return (
    <>
      <Squiggle />
      <p className="mb-1 text-sm font-bold">Take your data with you</p>
      <p className="mb-3 text-xs leading-relaxed font-medium text-[var(--ink-soft)]">
        Months of weigh-ins are worth more than the app around them. No lock-in,
        no account needed to read these.
      </p>
      <div className="flex flex-wrap gap-2">
        <a
          href="/api/export?what=all"
          className="sticker-flat tappable rounded-full px-3.5 py-2 text-xs font-bold"
          download
        >
          <span aria-hidden>📦</span> Everything (JSON)
        </a>
        <a
          href="/api/export?what=food"
          className="sticker-flat tappable rounded-full px-3.5 py-2 text-xs font-bold"
          download
        >
          <span aria-hidden>🍽️</span> Food log (CSV)
        </a>
        <a
          href="/api/export?what=weight"
          className="sticker-flat tappable rounded-full px-3.5 py-2 text-xs font-bold"
          download
        >
          <span aria-hidden>⚖️</span> Weight log (CSV)
        </a>
      </div>
    </>
  );
}
