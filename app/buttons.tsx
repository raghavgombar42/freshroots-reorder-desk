"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Icon, type IconName } from "./icons";

const VARIANTS = {
  primary: "bg-rail text-white hover:bg-[#21503f] shadow-sm",
  approve: "bg-data text-white hover:bg-[#186350] shadow-sm",
  human: "bg-human text-white hover:bg-[#985616] shadow-sm",
  outlineHuman: "border border-human/60 bg-white text-human hover:bg-human-soft",
  outlineCut: "border border-cut/50 bg-white text-cut hover:bg-cut-soft",
  outlineData: "border border-data/50 bg-white text-data hover:bg-data-soft",
  ghost: "border border-line bg-white text-ink hover:bg-paper",
} as const;

const SIZES = { sm: "h-8 px-3 text-[13px]", md: "h-9 px-4 text-sm" } as const;

/** A form submit button that shows it's working while the server action runs (and can't be double-clicked). */
export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  size = "sm",
  icon,
  className = "",
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  icon?: IconName;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-all active:scale-[0.98] disabled:cursor-wait disabled:opacity-70 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {pending ? <Spinner /> : icon ? <Icon name={icon} className="h-3.5 w-3.5" /> : null}
      {pending ? (pendingText ?? "Working…") : children}
    </button>
  );
}

export function Spinner({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`animate-spin ${className}`} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Flash message with a close button. */
export function Dismissable({ children, className }: { children: ReactNode; className: string }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div className={className} role="status">
      <div className="flex-1">{children}</div>
      <button type="button" onClick={() => setOpen(false)} className="rounded p-0.5 opacity-60 hover:opacity-100" aria-label="Dismiss message">
        <Icon name="x" className="h-4 w-4" />
      </button>
    </div>
  );
}
