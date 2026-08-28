/**
 * The little world behind the app: soft drifting blobs and a few food doodles.
 *
 * Every colour here is a token, because the same swatch cannot serve both
 * themes: a pale lavender that tints a white page is a searchlight on a black
 * one.
 * Pure CSS animation on transform/opacity, fixed and non-interactive, so it
 * costs nothing and never gets in the way.
 */
const BLOBS = [
  { tint: "var(--blob-1)", size: 320, top: "-6%", left: "-8%", delay: "0s" },
  { tint: "var(--blob-2)", size: 260, top: "12%", right: "-6%", delay: "-6s" },
  { tint: "var(--blob-3)", size: 300, bottom: "-8%", left: "10%", delay: "-12s" },
  { tint: "var(--blob-4)", size: 200, bottom: "18%", right: "8%", delay: "-3s" },
];

const DOODLES = [
  { emoji: "🍓", top: "14%", left: "6%", size: 22, delay: "0s" },
  { emoji: "🥑", top: "30%", right: "9%", size: 20, delay: "-1.4s" },
  { emoji: "🍜", bottom: "26%", left: "12%", size: 21, delay: "-2.6s" },
  { emoji: "🥑", top: "62%", right: "14%", size: 19, delay: "-3.8s" },
  { emoji: "🥕", top: "8%", right: "28%", size: 18, delay: "-2s" },
  { emoji: "🫐", bottom: "12%", right: "30%", size: 17, delay: "-4.6s" },
];

export function CandyBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {BLOBS.map((blob, i) => (
        <span
          key={i}
          className="animate-drift-x absolute rounded-full blur-3xl"
          style={{
            width: blob.size,
            height: blob.size,
            top: blob.top,
            left: blob.left,
            right: blob.right,
            bottom: blob.bottom,
            background: blob.tint,
            opacity: "var(--blob-opacity)",
            animationDelay: blob.delay,
          }}
        />
      ))}

      {DOODLES.map((d, i) => (
        <span
          key={i}
          className="animate-float absolute select-none"
          style={{
            top: d.top,
            left: d.left,
            right: d.right,
            bottom: d.bottom,
            fontSize: d.size,
            opacity: "var(--doodle-opacity)",
            animationDelay: d.delay,
            animationDuration: `${6 + i}s`,
          }}
        >
          {d.emoji}
        </span>
      ))}
    </div>
  );
}
