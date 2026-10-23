import type { ReactNode } from "react";
import { ACTION_LABEL, type Action } from "@/lib/engine";
import { Dismissable } from "./buttons";
import { Icon, type IconName } from "./icons";

export type SP = Promise<{ [k: string]: string | string[] | undefined }>;

/*
  Type scale (px): page title 26 · section 16 · card title 14.5 · body 14 · secondary 13 · labels 12 · KPI 30
  Spacing: 4px grid. Radii: 8 (controls) · 12 (cards). Borders do the work; shadows stay subtle.
*/

/* ---------- page structure ---------- */

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: ReactNode; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 max-w-3xl">
        {eyebrow && <div className="mb-1 flex flex-wrap items-center gap-2 text-[12px] font-medium text-muted">{eyebrow}</div>}
        <h1 className="text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">{title}</h1>
        {description && <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Step({ n }: { n: number }) {
  return <span className="rounded-md bg-rail-soft px-1.5 py-0.5 text-[11.5px] font-semibold text-rail">Step {n} of 3</span>;
}

export function SectionTitle({ title, meta, right }: { title: string; meta?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-[16px] font-semibold tracking-[-0.01em]">{title}</h2>
        {meta && <p className="mt-0.5 text-[13px] text-muted">{meta}</p>}
      </div>
      {right}
    </div>
  );
}

export function Card({
  title,
  subtitle,
  children,
  tone,
  right,
  icon,
  flush = false,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  tone?: "ai" | "human" | "code" | "data" | "cut";
  right?: ReactNode;
  icon?: IconName;
  /** true when the body is a full-width table */
  flush?: boolean;
}) {
  return (
    <section className={`rounded-xl border bg-board shadow-[0_1px_2px_rgba(28,28,24,0.03)] ${tone === "cut" ? "border-cut/30" : "border-line"}`}>
      {(title || right) && (
        <div className={`flex flex-wrap items-start justify-between gap-3 px-5 pt-4 ${flush ? "pb-3" : ""}`}>
          <div className="min-w-0">
            {title && (
              <h2 className="flex items-center gap-2 text-[14.5px] font-semibold text-ink">
                {icon && <Icon name={icon} className="h-4 w-4 text-faint" />}
                {title}
              </h2>
            )}
            {subtitle && <p className="mt-0.5 text-[13px] leading-snug text-muted">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      <div className={flush ? "" : `px-5 pb-5 ${title || right ? "pt-3" : "pt-5"}`}>{children}</div>
    </section>
  );
}

/** KPI tile: label, big number, one line of context. Tiles in a row share height. */
export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "cut" | "data" | "ai"; icon?: IconName }) {
  const valueTone = tone === "cut" ? "text-cut" : tone === "data" ? "text-rail" : "text-ink";
  return (
    <div className="flex h-full min-w-0 flex-col rounded-xl border border-line bg-board px-3.5 py-3 sm:px-4 sm:py-3.5 shadow-[0_1px_2px_rgba(28,28,24,0.03)]">
      <div className="text-[12.5px] font-medium text-muted">{label}</div>
      <div className={`num mt-1 text-[22px] font-semibold leading-tight tracking-[-0.025em] sm:text-[28px] ${valueTone}`}>{value}</div>
      {sub && <div className="mt-auto pt-1 text-[12.5px] leading-snug text-muted">{sub}</div>}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid auto-rows-fr grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">{children}</div>;
}

/** Compact informational note. Neutral by default; red only for things that stop work. */
export function Notice({ tone = "info", title, children, icon }: { tone?: "info" | "warn" | "cut" | "ai"; title?: ReactNode; children: ReactNode; icon?: IconName }) {
  const box = tone === "cut" ? "border-cut/25 bg-cut-soft" : tone === "warn" ? "border-human/25 bg-human-soft" : "border-line bg-sunk/60";
  const ic = { info: "text-muted", warn: "text-human", cut: "text-cut", ai: "text-ai" }[tone];
  return (
    <div className={`flex gap-2.5 rounded-lg border px-3.5 py-2.5 text-[13px] leading-relaxed ${box}`}>
      <Icon name={icon ?? (tone === "cut" || tone === "warn" ? "alert" : tone === "ai" ? "sparkles" : "info")} className={`mt-[3px] h-3.5 w-3.5 shrink-0 ${ic}`} />
      <div className="min-w-0 text-ink/85">
        {title && <span className="font-semibold text-ink">{title} </span>}
        {children}
      </div>
    </div>
  );
}

export async function Flash({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const err = typeof sp.err === "string" ? sp.err : null;
  if (!ok && !err) return null;
  return (
    <Dismissable
      className={`page-in flex items-start gap-3 rounded-lg border px-3.5 py-2.5 text-[13.5px] shadow-sm ${
        err ? "border-cut/25 bg-cut-soft text-cut" : "border-rail/20 bg-rail-soft text-rail"
      }`}
    >
      <span className="flex items-start gap-2">
        <Icon name={err ? "alert" : "check"} className="mt-[3px] h-3.5 w-3.5 shrink-0" />
        <span className="font-medium">{err ?? ok}</span>
      </span>
    </Dismissable>
  );
}

/* ---------- badges ---------- */

const ACTION_STYLE: Record<Action, { cls: string; dot: string }> = {
  REORDER_NOW: { cls: "bg-cut-soft text-cut", dot: "bg-cut" },
  REORDER_UP: { cls: "bg-human-soft text-human", dot: "bg-human" },
  PAUSE: { cls: "bg-code-soft text-code", dot: "bg-code" },
  NO_ACTION: { cls: "bg-sunk text-muted", dot: "bg-faint" },
  RAGHAV_DECIDES: { cls: "bg-ai-soft text-ai", dot: "bg-ai" },
};

export const ACTION_ACCENT: Record<Action, string> = {
  REORDER_NOW: "bg-cut",
  REORDER_UP: "bg-human",
  PAUSE: "bg-code",
  NO_ACTION: "bg-line-strong",
  RAGHAV_DECIDES: "bg-ai",
};

export function ActionBadge({ action }: { action: Action }) {
  const s = ACTION_STYLE[action];
  return (
    <span className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-[12.5px] font-semibold ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      {ACTION_LABEL[action]}
    </span>
  );
}

/** Status / label badge. One size everywhere; sentence case for readability. */
export function Tag({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "ai" | "cut" | "data" | "human" | "code" }) {
  const c = {
    muted: "text-muted bg-sunk",
    ai: "text-ai bg-ai-soft",
    cut: "text-cut bg-cut-soft",
    data: "text-rail bg-rail-soft",
    human: "text-human bg-human-soft",
    code: "text-code bg-code-soft",
  }[tone];
  return <span className={`inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-[11.5px] font-medium ${c}`}>{children}</span>;
}

/** Who does what: the actors used throughout the desk (same colours as the components map). */
export const SOURCE = {
  code: { label: "Rule", icon: "code" as IconName, tone: "code" as const },
  ai: { label: "AI · Gemini", icon: "sparkles" as IconName, tone: "ai" as const },
  human: { label: "Raghav", icon: "user" as IconName, tone: "human" as const },
  data: { label: "Data", icon: "database" as IconName, tone: "data" as const },
};

export function SourceTag({ kind }: { kind: keyof typeof SOURCE }) {
  const s = SOURCE[kind];
  return (
    <Tag tone={s.tone}>
      <Icon name={s.icon} className="h-3 w-3" />
      {s.label}
    </Tag>
  );
}

/* ---------- tables ---------- */

export type Col = string | { label: string; align?: "right" | "left"; width?: string };

/** Data table: quiet header, hairline row separators, right-aligned numbers (pass align: "right"). */
export function Table({ head, children, minWidth = 560 }: { head: Col[]; children: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13.5px]" style={{ minWidth }}>
        <thead>
          <tr className="border-y border-line bg-sunk/70 text-left">
            {head.map((h, i) => {
              const c = typeof h === "string" ? { label: h } : h;
              return (
                <th
                  key={i}
                  style={c.width ? { width: c.width } : undefined}
                  className={`whitespace-nowrap px-5 py-2 text-[12px] font-medium text-muted ${c.align === "right" ? "text-right" : ""}`}
                >
                  {c.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-line [&>tr:last-child]:border-0 [&>tr]:transition-colors [&>tr:hover]:bg-sunk/50 [&_td]:px-5 [&_td]:py-2.5 [&_td]:align-middle">
          {children}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyState({ icon = "box", title, children, compact = false }: { icon?: IconName; title: string; children?: ReactNode; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? "px-6 py-6" : "rounded-xl border border-dashed border-line-strong bg-board px-6 py-10"}`}>
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-sunk text-faint">
        <Icon name={icon} className="h-4.5 w-4.5" />
      </div>
      <div className="mt-2.5 text-[14px] font-semibold">{title}</div>
      {children && <div className="mt-1 max-w-md text-[13px] leading-relaxed text-muted">{children}</div>}
    </div>
  );
}

/* ---------- formatting ---------- */

export const lakh = (inr: number) => `₹${(inr / 100000).toLocaleString("en-IN", { maximumFractionDigits: 1 })} L`;
export const ist = (ts: string | Date | null) =>
  ts ? new Date(ts).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—";

export const istTime = (ts: string | Date) => new Date(ts).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
export const istDate = (ts: string | Date) => new Date(ts).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });

export function NoDb({ error }: { error: unknown }) {
  return (
    <Notice tone="cut" title="Database not reachable.">
      {(error as Error)?.message ?? String(error)} Refresh the page; if it persists, check DATABASE_URL and run <code>npm run db:setup</code>.
    </Notice>
  );
}
