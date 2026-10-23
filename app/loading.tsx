/** Shown while a page loads (the database round trip can take a second or two). */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2 border-b border-line pb-5">
        <div className="h-3 w-40 rounded bg-line" />
        <div className="h-7 w-64 rounded bg-line" />
        <div className="h-3 w-full max-w-2xl rounded bg-line/70" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl border border-line bg-board" />
        ))}
      </div>
      <div className="h-48 rounded-xl border border-line bg-board" />
      <div className="h-48 rounded-xl border border-line bg-board" />
    </div>
  );
}
