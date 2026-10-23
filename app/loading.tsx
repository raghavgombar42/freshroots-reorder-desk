/** Skeleton shown while a page loads (the database round trip can take a second or two). */
export default function Loading() {
  const bar = "rounded bg-line/80";
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading">
      <div className="space-y-2">
        <div className={`h-3 w-32 ${bar}`} />
        <div className={`h-7 w-56 ${bar}`} />
        <div className={`h-3.5 w-full max-w-xl ${bar}`} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2.5 rounded-xl border border-line bg-board p-4">
            <div className={`h-3 w-24 ${bar}`} />
            <div className={`h-6 w-28 ${bar}`} />
            <div className={`h-3 w-36 ${bar}`} />
          </div>
        ))}
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="space-y-3 rounded-xl border border-line bg-board p-5">
          <div className={`h-4 w-40 ${bar}`} />
          <div className={`h-3 w-full ${bar}`} />
          <div className={`h-3 w-5/6 ${bar}`} />
          <div className={`h-3 w-2/3 ${bar}`} />
        </div>
      ))}
    </div>
  );
}
