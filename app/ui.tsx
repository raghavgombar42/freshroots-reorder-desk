import type { ReactNode } from "react";
import { ACTION_LABEL, type Action } from "@/lib/engine";
import { Dismissable } from "./buttons";
import { Icon, type IconName } from "./icons";

export type SP = Promise<{ [k: string]: string | string[] | undefined }>;

/* ---------- page structure ---------- */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
      <div className="min-w-0 max-w-3xl">
        {eyebrow && <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs font-medium text-muted">{eyebrow}</div>}
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({
  title,
  subtitle,
  children,
  tone,
  right,
  icon,
  padded = true,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  tone?: "ai" | "human" | "code" | "data" | "cut";
  right?: ReactNode;
  icon?: IconName;
  padded?: boolean;
}) {
  const accent = tone ? { ai: "before:bg-ai", human: "before:bg-human", code: "before:bg-code", data: "before:bg-data", cut: "before:bg-cut" }[tone] : "";
  return (
    <section
      className={`relative overflow-hidden rounded-xl border border-line bg-board shadow-[0_1px_2px_rgba(16,24,20,0.04)] ${
        tone ? `before:absolute before:inset-y-0 before:left-0 before:w-[3px] ${accent}` : ""
      }`}
    >
      {(title || right) && (
        <div className={`flex flex-wrap items-start justify-between gap-3 ${padded ? "px-5 pt-4" : "px-5 py-4 border-b border-line"}`}>
          <div className="min-w-0">
            {title && (
              <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                {icon && <Icon name={icon} className="h-4 w-4 text-muted" />}
                {title}
              </h2>
            )}
            {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      <div className={padded ? "px-5 pb-5 pt-3" : ""}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone, icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "cut" | "data" | "ai"; icon?: IconName }) {
  const valueTone = tone === "cut" ? "text-cut" : tone === "data" ? "text-data" : tone === "ai" ? "text-ai" : "text-ink";
  return (
    <div className="rounded-xl border border-line bg-board p-4 shadow-[0_1px_2px_rgba(16,24,20,0.04)]">
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-muted">
        {icon && <Icon name={icon} className="h-3.5 w-3.5" />}
        {label}
      </div>
      <div className={`mt-1.5 text-[22px] font-semibold leading-tight tracking-tight tabular-nums ${valueTone}`}>{value}</div>
      {sub && <div className="mt-1 text-[12px] leading-snug text-muted">{sub}</div>}
    </div>
  );
}

/** Informational callout. */
export function Notice({ tone = "info", title, children, icon }: { tone?: "info" | "warn" | "cut" | "ai"; title?: ReactNode; children: ReactNode; icon?: IconName }) {
  const s = {
    info: "border-code/25 bg-code-soft/60 text-ink",
    warn: "border-human/30 bg-human-soft text-ink",
    cut: "border-cut/30 bg-cut-soft text-ink",
    ai: "border-ai/25 bg-ai-soft text-ink",
  }[tone];
  const ic = { info: "text-code", warn: "text-human", cut: "text-cut", ai: "text-ai" }[tone];
  return (
    <div className={`flex gap-3 rounded-xl border px-4 py-3 text-[13px] leading-relaxed ${s}`}>
      <Icon name={icon ?? (tone === "cut" || tone === "warn" ? "alert" : tone === "ai" ? "sparkles" : "info")} className={`mt-0.5 h-4 w-4 shrink-0 ${ic}`} />
      <div className="min-w-0">
        {title && <div className="font-semibold">{title}</div>}
        <div className={title ? "mt-0.5 text-ink/80" : ""}>{children}</div>
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
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-sm ${err ? "border-cut/30 bg-cut-soft text-cut" : "border-data/30 bg-data-soft text-[#145c48]"}`}
    >
      <span className="flex items-start gap-2">
        <Icon name={err ? "alert" : "check"} className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{err ?? ok}</span>
      </span>
    </Dismissable>
  );
}

/* ---------- badges ---------- */

const ACTION_STYLE: Record<Action, { cls: string; icon: IconName }> = {
  REORDER_NOW: { cls: "bg-cut-soft text-cut ring-cut/25", icon: "alert" },
  REORDER_UP: { cls: "bg-human-soft text-human ring-human/30", icon: "arrowUp" },
  PAUSE: { cls: "bg-code-soft text-code ring-code/25", icon: "pause" },
  NO_ACTION: { cls: "bg-paper text-muted ring-line", icon: "minus" },
  RAGHAV_DECIDES: { cls: "bg-ai-soft text-ai ring-ai/25", icon: "user" },
};

export const ACTION_ACCENT: Record<Action, string> = {
  REORDER_NOW: "bg-cut",
  REORDER_UP: "bg-human",
  PAUSE: "bg-code",
  NO_ACTION: "bg-line",
  RAGHAV_DECIDES: "bg-ai",
};

export function ActionBadge({ action }: { action: Action }) {
  const s = ACTION_STYLE[action];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${s.cls}`}>
      <Icon name={s.icon} className="h-3 w-3" />
      {ACTION_LABEL[action]}
    </span>
  );
}

export function Tag({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "ai" | "cut" | "data" | "human" | "code" }) {
  const c = {
    muted: "text-muted bg-paper ring-line",
    ai: "text-ai bg-ai-soft ring-ai/25",
    cut: "text-cut bg-cut-soft ring-cut/25",
    data: "text-data bg-data-soft ring-data/25",
    human: "text-human bg-human-soft ring-human/25",
    code: "text-code bg-code-soft ring-code/25",
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ring-1 ring-inset ${c}`}>{children}</span>;
}

/** Who does what: the four actors used throughout the desk (matches the components map colours). */
export const SOURCE = {
  code: { label: "Rule · code", icon: "code" as IconName, tone: "code" as const, text: "Deterministic rules decide actions and quantities" },
  ai: { label: "AI · Gemini", icon: "sparkles" as IconName, tone: "ai" as const, text: "Explains flagged SKUs in words only" },
  human: { label: "Human · Raghav", icon: "user" as IconName, tone: "human" as const, text: "Approves, edits or rejects every line" },
  data: { label: "Data · SAP / Zoho", icon: "database" as IconName, tone: "data" as const, text: "Inputs and outputs, logged in Supabase" },
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

export function Table({ head, children, minWidth = 560 }: { head: ReactNode[]; children: ReactNode; minWidth?: number }) {
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full text-[13px]" style={{ minWidth }}>
        <thead>
          <tr className="border-y border-line bg-paper/70 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-5 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-line [&>tr:last-child]:border-0 [&>tr:hover]:bg-paper/60 [&_td]:px-5 [&_td]:py-2.5 [&_td]:align-top">
          {children}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyState({ icon = "box", title, children }: { icon?: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-board px-6 py-10 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-full bg-paper text-muted">
        <Icon name={icon} className="h-5 w-5" />
      </div>
      <div className="mt-3 font-semibold">{title}</div>
      {children && <div className="mt-1 max-w-md text-[13px] text-muted">{children}</div>}
    </div>
  );
}

/* ---------- formatting ---------- */

export const lakh = (inr: number) => `₹${(inr / 100000).toLocaleString("en-IN", { maximumFractionDigits: 1 })} L`;
export const ist = (ts: string | Date | null) =>
  ts ? new Date(ts).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—";

export function NoDb({ error }: { error: unknown }) {
  return (
    <Notice tone="cut" title="Database not reachable">
      {(error as Error)?.message ?? String(error)}
      <div className="mt-1 text-muted">
        Set DATABASE_URL (Supabase Session pooler URI) and run <code>npm run db:setup</code>. Refreshing the page usually helps if this was a brief connection hiccup.
      </div>
    </Notice>
  );
}
