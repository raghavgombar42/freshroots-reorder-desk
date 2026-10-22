import type { ReactNode } from "react";
import { ACTION_LABEL, type Action } from "@/lib/engine";

export type SP = Promise<{ [k: string]: string | string[] | undefined }>;

export async function Flash({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ok = typeof sp.ok === "string" ? sp.ok : null;
  const err = typeof sp.err === "string" ? sp.err : null;
  if (!ok && !err) return null;
  return (
    <div className={`mb-4 rounded-lg border px-4 py-2 text-sm ${err ? "border-cut/40 bg-cut-soft text-cut" : "border-data/40 bg-data-soft text-data"}`} role="status">
      {err ?? ok}
    </div>
  );
}

export function Card({ title, children, tone, right }: { title?: ReactNode; children: ReactNode; tone?: "ai" | "human" | "code" | "data" | "cut"; right?: ReactNode }) {
  const border = { ai: "border-ai/50", human: "border-human/50", code: "border-code/40", data: "border-data/40", cut: "border-cut/50" }[tone ?? "data"] ?? "";
  return (
    <section className={`rounded-xl border ${tone ? border : "border-line"} bg-board p-4`}>
      {(title || right) && (
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          {title && <h2 className="font-semibold">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

const ACTION_STYLE: Record<Action, string> = {
  REORDER_NOW: "bg-cut-soft text-cut border-cut/40",
  REORDER_UP: "bg-human-soft text-human border-human/40",
  PAUSE: "bg-code-soft text-code border-code/40",
  NO_ACTION: "bg-paper text-muted border-line",
  RAGHAV_DECIDES: "bg-ai-soft text-ai border-ai/40",
};

export function ActionBadge({ action }: { action: Action }) {
  return <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${ACTION_STYLE[action]}`}>{ACTION_LABEL[action]}</span>;
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-board p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Tag({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "ai" | "cut" | "data" | "human" }) {
  const c = { muted: "text-muted border-line", ai: "text-ai border-ai/40", cut: "text-cut border-cut/40", data: "text-data border-data/40", human: "text-human border-human/40" }[tone];
  return <span className={`inline-block rounded border px-1.5 text-[10px] font-semibold uppercase tracking-wide ${c}`}>{children}</span>;
}

export const lakh = (inr: number) => `₹${(inr / 100000).toLocaleString("en-IN", { maximumFractionDigits: 1 })} L`;
export const ist = (ts: string | Date | null) =>
  ts ? new Date(ts).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—";

export function NoDb({ error }: { error: unknown }) {
  return (
    <Card title="Database not reachable" tone="cut">
      <p className="text-sm">{(error as Error)?.message ?? String(error)}</p>
      <p className="mt-2 text-sm text-muted">Set DATABASE_URL (Supabase Session pooler URI) and run <code>npm run db:setup</code>.</p>
    </Card>
  );
}
