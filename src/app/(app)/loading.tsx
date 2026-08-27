export default function Loading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading">
      <div className="h-4 w-32 animate-pulse rounded-full bg-[var(--track)]" />
      <div className="h-9 w-72 animate-pulse rounded-full bg-[var(--track)]" />
      <div className="sticker h-80 animate-pulse" />
      <div className="sticker h-32 animate-pulse" />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="sticker h-56 animate-pulse" />
        <div className="sticker h-56 animate-pulse" />
      </div>
    </div>
  );
}
