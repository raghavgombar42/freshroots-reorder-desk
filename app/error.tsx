"use client";

import { Icon } from "./icons";

/** Friendly fallback if a page throws (for example a brief database hiccup). */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-cut/25 bg-board p-6 shadow-sm">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-cut-soft text-cut">
        <Icon name="alert" className="h-5 w-5" />
      </div>
      <h1 className="mt-4 text-lg font-semibold">This page couldn&apos;t load</h1>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        Usually a brief connection hiccup with the database. Nothing was changed. Try again; if it keeps happening, check the Run log.
      </p>
      {error.message && <p className="mt-3 rounded-lg bg-paper px-3 py-2 font-mono text-[12px] text-muted">{error.message}</p>}
      <button onClick={reset} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-rail px-4 text-sm font-semibold text-white hover:bg-[#21503f]">
        <Icon name="history" className="h-3.5 w-3.5" /> Try again
      </button>
    </div>
  );
}
