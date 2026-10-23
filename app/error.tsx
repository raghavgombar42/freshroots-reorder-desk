"use client";

import { Icon } from "./icons";
import { buttonClass } from "./styles";

/** Friendly fallback if a page throws (for example a brief database hiccup). */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-line bg-board p-6 shadow-[0_1px_2px_rgba(28,28,24,0.03)]">
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-cut-soft text-cut">
        <Icon name="alert" className="h-4.5 w-4.5" />
      </div>
      <h1 className="mt-4 text-[18px] font-semibold">This page couldn&apos;t load</h1>
      <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
        Usually a brief connection hiccup with the database. Nothing was changed. Try again; if it keeps happening, check the Run log.
      </p>
      {error.message && <p className="mt-3 rounded-lg bg-sunk px-3 py-2 font-mono text-[12px] text-muted">{error.message}</p>}
      <button onClick={reset} className={`mt-4 ${buttonClass("primary", "md")}`}>
        <Icon name="history" className="h-3.5 w-3.5" /> Try again
      </button>
    </div>
  );
}
