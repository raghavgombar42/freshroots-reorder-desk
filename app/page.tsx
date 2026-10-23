import { db, withDb } from "@/lib/db";
import { isOperator } from "@/lib/auth";
import type { Action, Metrics } from "@/lib/engine";
import { approveAllRuleRecs, decide, runNow } from "./actions";
import { SubmitButton } from "./buttons";
import { Icon, type IconName } from "./icons";
import { ACTION_ACCENT, ActionBadge, Card, EmptyState, Flash, NoDb, Notice, PageHeader, SourceTag, Stat, Table, Tag, ist, type SP } from "./ui";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Rec = {
  id: number;
  sku_id: string;
  name: string;
  perishability: string;
  std_qty: number;
  action: Action;
  qty: number;
  rules_fired: string[];
  exceptions: string[];
  reason: string;
  metrics: Metrics;
  ai_unusual: string | null;
  ai_check: string | null;
  status: string;
  final_qty: number | null;
  decision_reason: string | null;
};

const ORDER: Action[] = ["RAGHAV_DECIDES", "REORDER_NOW", "REORDER_UP", "PAUSE", "NO_ACTION"];

async function load() {
  const sql = db();
  // Independent reads in parallel: the database is a long way from Mumbai, so round trips add up.
  const [[latest], [run], [rate]] = await Promise.all([
    sql`select * from runs where status <> 'running' order by id desc limit 1`,
    sql`select * from runs where status = 'ok' order by id desc limit 1`,
    sql`select count(*) filter (where decision = 'rejected')::int as rejected, count(*)::int as decided from decisions`,
  ]);
  const [recs, [cost]] = run
    ? await Promise.all([
        sql`select r.*, s.name, s.perishability, s.std_qty, d.final_qty, d.reason as decision_reason
          from recommendations r join skus s on s.id = r.sku_id left join decisions d on d.recommendation_id = r.id
          where r.run_id = ${run.id}` as unknown as Promise<Rec[]>,
        sql`select coalesce(sum(cost_usd), 0)::float as usd, count(*)::int as calls from llm_calls where run_id = ${run.id}`,
      ])
    : [[] as Rec[], [{ usd: 0, calls: 0 }]];
  return { latest, run, recs, rate, cost };
}

const short = (name: string) => name.replace("Freshroots ", "");

export default async function Home({ searchParams }: { searchParams: SP }) {
  let data;
  try {
    data = await withDb(load);
  } catch (e) {
    return <NoDb error={e} />;
  }
  const { latest, run, recs, rate, cost } = data;
  const operator = await isOperator();
  recs.sort((a, b) => ORDER.indexOf(a.action) - ORDER.indexOf(b.action) || a.sku_id.localeCompare(b.sku_id));
  const flagged = recs.filter((r) => r.action !== "NO_ACTION");
  const quiet = recs.filter((r) => r.action === "NO_ACTION");
  const pendingRule = recs.filter((r) => r.status === "pending" && ["REORDER_NOW", "REORDER_UP", "PAUSE"].includes(r.action)).length;
  const pendingAll = flagged.filter((r) => r.status === "pending").length;
  const rejectPct = rate.decided ? Math.round((rate.rejected / rate.decided) * 100) : 0;
  const outsideRules = recs.filter((r) => r.action === "RAGHAV_DECIDES").length;

  return (
    <div className="space-y-6">
      <Flash searchParams={searchParams} />

      <PageHeader
        eyebrow={
          <>
            <span className="rounded-full bg-rail px-2 py-0.5 text-[11px] font-semibold text-white">Step 1 of 3</span>
            <span>Review and decide</span>
          </>
        }
        title="Recommendations"
        description={
          <>
            Every Monday and Thursday at 7:00 am IST the desk reads the SAP export and applies Raghav&apos;s written rules to every SKU. Flagged lines
            wait here for his decision. <b className="font-semibold text-ink">Nothing is ordered until he approves</b> and procurement issues the draft
            PO in Zoho.
          </>
        }
        actions={
          operator ? (
            <form action={runNow}>
              <SubmitButton variant="human" size="md" icon="play" pendingText="Running…">
                Run now
              </SubmitButton>
            </form>
          ) : null
        }
      />

      <WorkflowStrip />

      <PilotNote />

      {latest && latest.status !== "ok" && (
        <Notice tone="cut" title={`Latest run #${latest.id} was ${latest.status} (${ist(latest.started_at)})`}>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {(latest.problems as string[]).slice(0, 8).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <div className="mt-1.5 text-muted">A bad or incomplete file stops the run; nothing is guessed. The last good run is shown below.</div>
        </Notice>
      )}

      {!run ? (
        <EmptyState icon="upload" title="No completed run yet">
          Load the SAP export on the SAP data page, then press Run now.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              icon="clock"
              label={`Latest run · #${run.id}`}
              value={ist(run.started_at)}
              sub={`${run.trigger === "cron" ? "Scheduled" : "Run now"} · rules v${run.rule_version}${run.festival ? " · festival month (+uplift)" : ""}`}
            />
            <Stat icon="alert" label="Flagged SKUs" value={`${flagged.length} / ${recs.length}`} sub={`${outsideRules} outside the rules → Raghav decides`} />
            <Stat
              icon="user"
              label="Raghav's reject rate"
              tone={rejectPct > 50 ? "cut" : undefined}
              value={rate.decided ? `${rejectPct}%` : "—"}
              sub={`${rate.rejected} of ${rate.decided} decisions · kill line 50%`}
            />
            <Stat icon="sparkles" label="AI cost this run" value={`$${Number(cost.usd).toFixed(4)}`} sub={`${cost.calls} Gemini calls · explanations only`} />
          </div>

          {run.summary && (
            <Card
              tone="ai"
              icon="sparkles"
              title="Cycle summary for Deepa"
              subtitle="Written by Gemini from this run's numbers. A summary only; it doesn't change any decision."
              right={<SourceTag kind="ai" />}
            >
              <ul className="space-y-2 text-[14px] leading-relaxed">
                {String(run.summary)
                  .split("\n")
                  .map((l) => (
                    <li key={l} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ai/60" aria-hidden="true" />
                      <span>{l}</span>
                    </li>
                  ))}
              </ul>
            </Card>
          )}

          <section aria-labelledby="queue" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="queue" className="text-[17px] font-semibold tracking-tight">
                  Needs a decision
                </h2>
                <p className="text-[13px] text-muted">
                  {pendingAll} awaiting Raghav · {flagged.length - pendingAll} decided · ordered by urgency
                </p>
              </div>
              {operator && pendingRule > 0 && (
                <form action={approveAllRuleRecs}>
                  <input type="hidden" name="runId" value={run.id} />
                  <SubmitButton variant="outlineData" icon="check" pendingText="Approving…">
                    Approve all {pendingRule} rule-based lines
                  </SubmitButton>
                </form>
              )}
            </div>
            <Legend />
            {flagged.length === 0 ? (
              <EmptyState icon="check" title="Nothing flagged this run">
                Every SKU is inside its stock band.
              </EmptyState>
            ) : (
              <div className="space-y-3">
                {flagged.map((r) => (
                  <RecCard key={r.id} r={r} operator={operator} />
                ))}
              </div>
            )}
          </section>

          <Card icon="check" title={`No action needed (${quiet.length})`} subtitle="Inside the stock band. Decided by the rules; nothing for Raghav to do.">
            {quiet.length === 0 ? (
              <p className="text-[13px] text-muted">Every SKU was flagged this run.</p>
            ) : (
              <Table head={["SKU", "Weeks of cover", "4 vs 12-wk", "Reason (rule · code)"]}>
                {quiet.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">
                      <span className="font-semibold">{short(r.name)}</span>
                      <span className="ml-1.5 font-mono text-[11px] text-muted">{r.sku_id}</span>
                    </td>
                    <td className="tabular-nums">{r.metrics.weeksOfCover ?? "no sales"}</td>
                    <td className="tabular-nums">
                      {r.metrics.trendPct > 0 ? "+" : ""}
                      {r.metrics.trendPct}%
                    </td>
                    <td className="text-muted">{r.reason}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/* ---------- presentational pieces ---------- */

function WorkflowStrip() {
  const steps: { icon: IconName; title: string; text: string; tone: string }[] = [
    { icon: "database", title: "SAP data in", text: "Sales, stock, SKU master", tone: "text-data bg-data-soft" },
    { icon: "code", title: "Rules decide", text: "Raghav's 5 rules, in code", tone: "text-code bg-code-soft" },
    { icon: "sparkles", title: "AI explains", text: "Flagged SKUs only, words only", tone: "text-ai bg-ai-soft" },
    { icon: "user", title: "Raghav decides", text: "Approve, edit or reject", tone: "text-human bg-human-soft" },
    { icon: "file", title: "Draft PO in Zoho", text: "Procurement issues it", tone: "text-data bg-data-soft" },
  ];
  return (
    <ol className="grid gap-2 rounded-xl border border-line bg-board p-3 shadow-[0_1px_2px_rgba(16,24,20,0.04)] sm:grid-cols-5" aria-label="How a cycle works">
      {steps.map((s, i) => (
        <li key={s.title} className="relative flex items-center gap-3 rounded-lg px-2 py-1.5">
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${s.tone}`}>
            <Icon name={s.icon} className="h-4 w-4" />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block text-[13px] font-semibold">
              <span className="mr-1 text-muted">{i + 1}.</span>
              {s.title}
            </span>
            <span className="block text-[11.5px] text-muted">{s.text}</span>
          </span>
          {i < steps.length - 1 && <Icon name="arrowRight" className="absolute -right-2 top-1/2 hidden h-3.5 w-3.5 -translate-y-1/2 text-line sm:block" />}
        </li>
      ))}
    </ol>
  );
}

function PilotNote() {
  return (
    <details className="group rounded-xl border border-code/20 bg-code-soft/50 px-4 py-2.5 text-[13px]">
      <summary className="flex items-center gap-2 font-medium text-ink">
        <Icon name="info" className="h-4 w-4 text-code" />
        About this pilot: what is real and what is simulated
        <Icon name="chevron" className="chev ml-auto h-4 w-4 text-muted transition-transform" />
      </summary>
      <ul className="mt-2.5 space-y-1.5 border-t border-code/15 pt-2.5 leading-relaxed text-ink/85">
        <li>
          <b className="font-semibold">Data:</b> the MESA case files: 15 sample SKUs (of Freshroots&apos; ~400), 16 weeks of sales, one warehouse. SAP is
          not connected live; its export is uploaded on the SAP data page.
        </li>
        <li>
          <b className="font-semibold">Recommendations are advisory.</b> Actions and quantities come from Raghav&apos;s written rules (code). Gemini only
          writes the explanation text and cannot change a quantity.
        </li>
        <li>
          <b className="font-semibold">Nothing is ordered automatically.</b> Approved lines become <i>draft</i> purchase orders in a pilot Zoho Inventory
          organisation; procurement adds prices and issues them.
        </li>
        <li>
          <b className="font-semibold">Losses (₹)</b> are entered by hand on the Loss tracker; the case data has no prices.
        </li>
      </ul>
    </details>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-muted">
      <span className="font-medium text-ink">Who does what:</span>
      <span className="flex items-center gap-1.5">
        <SourceTag kind="code" /> decides action + quantity
      </span>
      <span className="flex items-center gap-1.5">
        <SourceTag kind="ai" /> explains, words only
      </span>
      <span className="flex items-center gap-1.5">
        <SourceTag kind="human" /> final decision
      </span>
    </div>
  );
}

function Metric({ label, value, note, warn }: { label: string; value: string; note?: string; warn?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg bg-paper/70 px-3 py-2">
      <div className="text-[11px] font-medium text-muted">{label}</div>
      <div className={`text-[15px] font-semibold tabular-nums ${warn ? "text-cut" : "text-ink"}`}>{value}</div>
      {note && <div className="truncate text-[11px] text-muted">{note}</div>}
    </div>
  );
}

function RecCard({ r, operator }: { r: Rec; operator: boolean }) {
  const m = r.metrics;
  const decided = r.status !== "pending";
  const outside = r.action === "RAGHAV_DECIDES";
  const qtyLabel = r.qty > 0 ? `${r.qty.toLocaleString("en-IN")} units` : r.action === "PAUSE" ? "Pause next order" : outside ? "Raghav sets qty" : "No order";
  return (
    <article className={`relative overflow-hidden rounded-xl border bg-board shadow-[0_1px_2px_rgba(16,24,20,0.04)] ${outside ? "border-ai/35" : "border-line"} ${decided ? "opacity-[0.92]" : ""}`}>
      <span className={`absolute inset-y-0 left-0 w-1 ${ACTION_ACCENT[r.action]}`} aria-hidden="true" />
      <div className="space-y-3 py-4 pl-6 pr-5">
        {/* What */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ActionBadge action={r.action} />
              {r.perishability === "High" && <Tag tone="human">Perishable</Tag>}
            </div>
            <h3 className="mt-1.5 text-[16px] font-semibold tracking-tight">
              {short(r.name)} <span className="ml-1 font-mono text-[12px] font-normal text-muted">{r.sku_id}</span>
            </h3>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Recommended</div>
            <div className="text-[20px] font-semibold tabular-nums leading-tight">{qtyLabel}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Stock on hand" value={`${m.stock.toLocaleString("en-IN")}`} note="units" />
          <Metric label="Weekly demand" value={`${m.weeklyDemand}`} note={m.upliftPct ? `incl. +${m.upliftPct}% festival` : "12-week average"} />
          <Metric label="Weeks of cover" value={m.weeksOfCover === null ? "—" : `${m.weeksOfCover}`} note={m.weeksOfCover === null ? "no sales" : "weeks"} warn={r.action === "REORDER_NOW"} />
          <Metric label="Trend, 4 vs 12 wk" value={`${m.trendPct > 0 ? "+" : ""}${m.trendPct}%`} note={m.weeksOfHistory < 12 ? `${m.weeksOfHistory} wks history` : undefined} />
        </div>

        {/* Why: the rule */}
        <div className="rounded-lg border border-code/15 bg-code-soft/40 px-3 py-2.5">
          <div className="mb-1 flex items-center gap-2">
            <SourceTag kind="code" />
            <span className="text-[12px] font-medium text-muted">Why</span>
          </div>
          <p className="text-[13.5px] leading-relaxed">{r.reason}</p>
          {r.rules_fired.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {r.rules_fired.map((x) => (
                <span key={x} className="rounded-md bg-white px-2 py-0.5 text-[11.5px] text-code ring-1 ring-inset ring-code/15">
                  {x}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* AI explanation */}
        {(r.ai_unusual || r.ai_check) && (
          <details open className="rounded-lg border border-ai/15 bg-ai-soft/60 px-3 py-2.5">
            <summary className="flex items-center gap-2">
              <SourceTag kind="ai" />
              <span className="text-[12px] font-medium text-muted">Explanation only · can&apos;t change the quantity</span>
              <Icon name="chevron" className="chev ml-auto h-4 w-4 text-muted transition-transform" />
            </summary>
            <div className="mt-2 space-y-1.5 text-[13.5px] leading-relaxed">
              {r.ai_unusual && <p>{r.ai_unusual}</p>}
              {r.ai_check && (
                <p>
                  <b className="font-semibold">What to check: </b>
                  <span className="text-ink/85">{r.ai_check}</span>
                </p>
              )}
            </div>
          </details>
        )}

        {/* Decision */}
        <div className="border-t border-line pt-3">
          {decided ? (
            <Decided r={r} />
          ) : operator ? (
            <DecisionControls r={r} />
          ) : (
            <p className="flex items-center gap-2 text-[13px] text-muted">
              <SourceTag kind="human" /> Awaiting Raghav&apos;s decision. Unlock the desk to act.
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

function Decided({ r }: { r: Rec }) {
  const rejected = r.status === "rejected";
  const text = r.final_qty != null && r.final_qty > 0 ? `${r.final_qty.toLocaleString("en-IN")} units → draft PO` : rejected ? "No PO" : "No PO needed";
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px]">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
          rejected ? "bg-cut-soft text-cut ring-cut/25" : r.status === "edited" ? "bg-human-soft text-human ring-human/25" : "bg-data-soft text-data ring-data/25"
        }`}
      >
        <Icon name={rejected ? "x" : r.status === "edited" ? "pencil" : "check"} className="h-3 w-3" />
        {r.status === "approved" ? "Approved" : r.status === "edited" ? "Edited" : "Rejected"} by Raghav
      </span>
      <span className="font-medium">{text}</span>
      {r.decision_reason && <span className="text-muted">· “{r.decision_reason}”</span>}
    </div>
  );
}

function DecisionControls({ r }: { r: Rec }) {
  const outside = r.action === "RAGHAV_DECIDES";
  return (
    <div className="flex flex-wrap items-start gap-2">
      {!outside && (
        <form action={decide}>
          <input type="hidden" name="recId" value={r.id} />
          <input type="hidden" name="decision" value="approved" />
          <SubmitButton variant="approve" icon="check" pendingText="Approving…">
            Approve{r.qty > 0 ? ` ${r.qty.toLocaleString("en-IN")}` : ""}
          </SubmitButton>
        </form>
      )}
      <details className="group" open={outside}>
        <summary className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-human/60 bg-white px-3 text-[13px] font-semibold text-human hover:bg-human-soft">
          <Icon name="pencil" className="h-3.5 w-3.5" />
          {outside ? "Set quantity" : "Edit quantity"}
        </summary>
        <form action={decide} className="mt-2 flex flex-wrap items-center gap-2">
          <input type="hidden" name="recId" value={r.id} />
          <input type="hidden" name="decision" value="edited" />
          <label className="sr-only" htmlFor={`qty-${r.id}`}>
            Quantity
          </label>
          <input id={`qty-${r.id}`} name="qty" type="number" min={0} step={1} defaultValue={r.qty || r.std_qty} className="field w-24 tabular-nums" aria-label="Quantity" />
          <input name="reason" required placeholder="Why this quantity?" className="field w-56" aria-label="Reason for the quantity" />
          <SubmitButton variant="human" pendingText="Saving…">
            Save
          </SubmitButton>
        </form>
      </details>
      <details className="group">
        <summary className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-cut/50 bg-white px-3 text-[13px] font-semibold text-cut hover:bg-cut-soft">
          <Icon name="x" className="h-3.5 w-3.5" />
          Reject
        </summary>
        <form action={decide} className="mt-2 flex flex-wrap items-center gap-2">
          <input type="hidden" name="recId" value={r.id} />
          <input type="hidden" name="decision" value="rejected" />
          <input name="reason" required placeholder="Reason for rejecting" className="field w-64" aria-label="Reason for rejecting" />
          <SubmitButton variant="outlineCut" pendingText="Rejecting…">
            Confirm reject
          </SubmitButton>
        </form>
      </details>
    </div>
  );
}
