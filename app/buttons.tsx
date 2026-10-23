"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Icon, type IconName } from "./icons";

import { buttonClass, type Size, type Variant } from "./styles";

// Older variant names map onto the four-level hierarchy so every page stays consistent.
const ALIAS: Record<string, Variant> = {
  approve: "primary",
  human: "primary",
  outlineHuman: "secondary",
  outlineData: "secondary",
  outlineCut: "danger",
};

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
  variant?: Variant | keyof typeof ALIAS;
  size?: Size;
  icon?: IconName;
  className?: string;
}) {
  const { pending } = useFormStatus();
  const v = (ALIAS[variant as string] ?? variant) as Variant;
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={`${buttonClass(v, size)} ${className}`}>
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
      <div className="min-w-0 flex-1">{children}</div>
      <button type="button" onClick={() => setOpen(false)} className="rounded p-0.5 opacity-50 transition-opacity hover:opacity-100" aria-label="Dismiss message">
        <Icon name="x" className="h-4 w-4" />
      </button>
    </div>
  );
}
