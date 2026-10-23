import { db, withDb } from "@/lib/db";
import { isOperator } from "@/lib/auth";
import type { Action, Metrics } from "@/lib/engine";
import { approveAllRuleRecs, decide, runNow } from "./actions";
import { SubmitButton } from "./buttons";
import { buttonClass } from "./styles";
import { Icon } from "./icons";
import {
  ACTION_ACCENT,
  ActionBadge,
  Card,
  EmptyState,
  Flash,
  NoDb,
  Notice,
  PageHeader,
  SectionTitle,
  SourceTag,
  Stat,
  StatGrid,
  Step,
  Table,
  Tag,
  ist,
  istDate,
  istTime,
  type SP,
} from "./ui";

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
const fmt = (n: number) => n.toLocaleString("en-IN");

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
            <Step n={1} />
            <span>Review and decide</span>
          </>
        }
        title="Recommendations"
        description={
          <>
            Every Monday and Thursday at 7:00 am IST the desk applies Raghav&apos;s written rules to the latest SAP export.{" "}
            <span className="text-ink">Nothing is ordered until Raghav approves</span> and procurement issues the draft PO in Zoho.
          </>
        }
        actions={
          operator ? (
            <form action={runNow}>
              <SubmitButton variant="primary" size="md" icon="play" pendingText="Running…">
                Run now
              </SubmitButton>
            </form>
          ) : null
        }
      />

      <CycleBar />

      {latest && latest.status !== "ok" && (
        <Notice tone="cut" title={`Latest run #${latest.id} was ${latest.status} (${ist(latest.started_at)}).`}>
          {(latest.problems as string[]).slice(0, 4).join(" · ")} — a bad or incomplete file stops the run; nothing is guessed. The last good run is
          shown below.
        </Notice>
      )}

      {!run ? (
        <EmptyState icon="upload" title="No completed run yet">
          Load the SAP export on the SAP data page, then press Run now.
        </EmptyState>
      ) : (
        <>
          <StatGrid>
            <Stat
              label={`Latest run · #${run.id}`}
              value={istTime(run.started_at)}
              sub={`${istDate(run.started_at)} · ${run.trigger === "cron" ? "Scheduled" : "Run now"} · rules v${run.rule_version}${run.festival ? " · festival month (+uplift)" : ""}`}
            />
            <Stat label="Flagged SKUs" value={`${flagged.length} / ${recs.length}`} sub={`${outsideRules} outside the rules → Raghav decides`} />
            <Stat
              label="Raghav's reject rate"
              tone={rejectPct > 50 ? "cut" : undefined}
              value={rate.decided ? `${rejectPct}%` : "—"}
              sub={`${rate.rejected} of ${rate.decided} decisions · kill line 50%`}
            />
            <Stat label="AI cost this run" value={`$${Number(cost.usd).toFixed(4)}`} sub={`${cost.calls} Gemini calls · explanations only`} />
          </StatGrid>

          {run.summary && (
            <Card
              title="Cycle summary"
              subtitle="Written by Gemini from this run's numbers for Deepa. A summary only; it changes no decision."
              right={<SourceTag kind="ai" />}
            >
              <ul className="space-y-1.5 text-[14px] leading-relaxed">
                {String(run.summary)
                  .split("\n")
                  .map((l) => (
                    <li key={l} className="flex gap-2.5">
                      <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-faint" aria-hidden="true" />
                      <span>{l}</span>
                    </li>
                  ))}
              </ul>
            </Card>
          )}

          <section aria-labelledby="queue" className="space-y-3">
            <SectionTitle
              title="Needs a decision"
              meta={
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>
                    <b className="num font-semibold text-ink">{pendingAll}</b> awaiting Raghav · <span className="num">{flagged.length - pendingAll}</span> decided ·
                    most urgent first
                  </span>
                  <span className="hidden items-center gap-1.5 text-faint sm:flex">
                    <SourceTag kind="code" /> sets action + qty
                    <SourceTag kind="ai" /> explains
                    <SourceTag kind="human" /> decides
                  </span>
                </span>
              }
              right={
                operator && pendingRule > 0 ? (
                  <form action={approveAllRuleRecs}>
                    <input type="hidden" name="runId" value={run.id} />
                    <SubmitButton variant="secondary" icon="check" pendingText="Approving…">
                      Approve all {pendingRule} rule-based lines
                    </SubmitButton>
                  </form>
                ) : null
              }
            />
            {flagged.length === 0 ? (
              <EmptyState icon="check" title="Nothing flagged this run">
                Every SKU is inside its stock band.
              </EmptyState>
            ) : (
              <div className="space-y-2.5">
                {flagged.map((r) => (
                  <RecCard key={r.id} r={r} operator={operator} />
                ))}
              </div>
            )}
          </section>

          <Card flush title={`No action needed · ${quiet.length}`} subtitle="Inside the stock band. Decided by the rules; nothing for Raghav to do.">
            {quiet.length === 0 ? (
              <EmptyState compact icon="check" title="Every SKU was flagged this run" />
            ) : (
              <Table
                head={[
                  { label: "SKU", width: "26%" },
                  { label: "Weeks of cover", align: "right" },
                  { label: "4 vs 12-wk", align: "right" },
                  "Reason (rule)",
                ]}
                minWidth={640}
              >
                {quiet.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">
                      <span className="font-medium">{short(r.name)}</span>
                      <span className="ml-2 font-mono text-[11.5px] text-faint">{r.sku_id}</span>
                    </td>
                    <td className="num text-right">{r.metrics.weeksOfCover ?? "no sales"}</td>
                    <td className="num text-right">
                      {r.metrics.trendPct > 0 ? "+" : ""}
                      {r.metrics.trendPct}%
                    </td>
                    <td className="text-[13px] text-muted">{r.reason}</td>
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

/** One-line "how a cycle works", plus the pilot disclosure. Kept compact so the data stays above the fold. */
function CycleBar() {
  const steps = ["SAP data in", "Rules decide", "AI explains flagged SKUs", "Raghav decides", "Draft PO in Zoho"];
  return (
    <div className="rounded-xl border border-line bg-board">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-4 py-2.5 text-[13px]" aria-label="How a cycle works">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className="num grid h-5 w-5 place-items-center rounded-full bg-sunk text-[11px] font-semibold text-muted">{i + 1}</span>
            <span className="font-medium text-ink/85">{s}</span>
            {i < steps.length - 1 && <Icon name="arrowRight" className="h-3.5 w-3.5 text-faint" />}
          </li>
        ))}
      </ol>
      <details className="border-t border-line">
        <summary className="flex items-center gap-2 px-4 py-2 text-[12.5px] font-medium text-muted hover:text-ink">
          <Icon name="info" className="h-3.5 w-3.5" />
          About this pilot: what is real and what is simulated
          <Icon name="chevron" className="chev ml-auto h-3.5 w-3.5 transition-transform" />
        </summary>
        <ul className="grid gap-x-8 gap-y-1.5 px-4 pb-3 text-[13px] leading-relaxed text-ink/80 md:grid-cols-2">
          <li>
            <b className="font-semibold text-ink">Data:</b> the MESA case files: 15 sample SKUs (of Freshroots&apos; ~400), 16 weeks of sales, one
            warehouse. SAP is not connected live; its export is uploaded on the SAP data page.
          </li>
          <li>
            <b className="font-semibold text-ink">Advisory only.</b> Actions and quantities come from Raghav&apos;s written rules (code). Gemini only
            writes explanation text and cannot change a quantity.
          </li>
          <li>
            <b className="font-semibold text-ink">Nothing is ordered automatically.</b> Approved lines become draft POs in a pilot Zoho Inventory
            organisation; procurement adds prices and issues them.
          </li>
          <li>
            <b className="font-semibold text-ink">Losses (₹)</b> are entered by hand on the Loss tracker; the case data has no prices.
          </li>
        </ul>
      </details>
    </div>
  );
}

function Metric({ label, value, note, warn }: { label: string; value: string; note?: string; warn?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] text-muted">{label}</div>
      <div className={`num text-[16px] font-semibold leading-snug ${warn ? "text-cut" : "text-ink"}`}>
        {value}
        {note && <span className="ml-1 text-[12px] font-normal text-faint">{note}</span>}
      </div>
    </div>
  );
}

function RecCard({ r, operator }: { r: Rec; operator: boolean }) {
  const m = r.metrics;
  const decided = r.status !== "pending";
  const outside = r.action === "RAGHAV_DECIDES";
  const qtyLabel = r.qty > 0 ? fmt(r.qty) : r.action === "PAUSE" ? "Pause" : outside ? "Your call" : "—";
  const qtyNote = r.qty > 0 ? "units" : r.action === "PAUSE" ? "next order" : outside ? "Raghav sets qty" : "";
  return (
    <article
      className={`relative overflow-hidden rounded-xl border bg-board shadow-[0_1px_2px_rgba(28,28,24,0.03)] transition-shadow hover:shadow-[0_2px_8px_rgba(28,28,24,0.06)] ${
        outside ? "border-ai/30" : "border-line"
      }`}
    >
      <span className={`absolute inset-y-0 left-0 w-[3px] ${ACTION_ACCENT[r.action]}`} aria-hidden="true" />
      <div className="grid lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Left: what + numbers + why */}
        <div className="space-y-3 py-4 pl-5 pr-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <ActionBadge action={r.action} />
                {r.perishability === "High" && <Tag tone="human">Perishable</Tag>}
              </div>
              <h3 className="mt-1.5 text-[16px] font-semibold tracking-[-0.01em]">
                {short(r.name)}
                <span className="ml-2 font-mono text-[12px] font-normal text-faint">{r.sku_id}</span>
              </h3>
            </div>
            <div className="text-right">
              <div className="text-[12px] text-muted">Recommended</div>
              <div className="num text-[22px] font-semibold leading-tight tracking-[-0.02em]">
                {qtyLabel}
                {qtyNote && <span className="ml-1 text-[12.5px] font-normal text-muted">{qtyNote}</span>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-y border-line py-2.5 sm:grid-cols-4">
            <Metric label="Stock on hand" value={fmt(m.stock)} note="units" />
            <Metric label="Weekly demand" value={`${m.weeklyDemand}`} note={m.upliftPct ? `+${m.upliftPct}% festival` : "12-wk avg"} />
            <Metric label="Weeks of cover" value={m.weeksOfCover === null ? "—" : `${m.weeksOfCover}`} note={m.weeksOfCover === null ? "no sales" : "wks"} warn={r.action === "REORDER_NOW"} />
            <Metric label="Trend, 4 vs 12 wk" value={`${m.trendPct > 0 ? "+" : ""}${m.trendPct}%`} note={m.weeksOfHistory < 12 ? `${m.weeksOfHistory} wks data` : undefined} />
          </div>

          <div>
            <div className="mb-1 flex items-center gap-2">
              <SourceTag kind="code" />
              <span className="text-[12px] text-muted">Why</span>
            </div>
            <p className="text-[13.5px] leading-relaxed text-ink/90">{r.reason}</p>
            {r.rules_fired.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.rules_fired.map((x) => (
                  <span key={x} className="rounded-md border border-line bg-sunk/60 px-1.5 py-0.5 text-[12px] text-muted">
                    {x}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: AI explanation + decision */}
        <div className="flex flex-col gap-3 border-t border-line bg-sunk/40 px-5 py-4 lg:border-l lg:border-t-0">
          {r.ai_unusual || r.ai_check ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <SourceTag kind="ai" />
                <span className="text-[12px] text-muted">Explains only</span>
              </div>
              {r.ai_unusual && <p className="text-[13px] leading-relaxed text-ink/85">{r.ai_unusual}</p>}
              {r.ai_check && (
                <p className="text-[13px] leading-relaxed text-ink/85">
                  <span className="font-semibold text-ink">Check: </span>
                  {r.ai_check}
                </p>
              )}
            </div>
          ) : (
            <p className="text-[12.5px] text-faint">No AI note for this line.</p>
          )}

          <div className="mt-auto border-t border-line pt-3">
            {decided ? (
              <Decided r={r} />
            ) : operator ? (
              <DecisionControls r={r} />
            ) : (
              <p className="flex items-center gap-2 text-[12.5px] text-muted">
                <SourceTag kind="human" /> Awaiting decision · unlock to act
              </p>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function Decided({ r }: { r: Rec }) {
  const rejected = r.status === "rejected";
  const text = r.final_qty != null && r.final_qty > 0 ? `${fmt(r.final_qty)} units → draft PO` : rejected ? "No PO" : "No PO needed";
  return (
    <div className="space-y-1 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <Tag tone={rejected ? "cut" : r.status === "edited" ? "human" : "data"}>
          <Icon name={rejected ? "x" : r.status === "edited" ? "pencil" : "check"} className="h-3 w-3" />
          {r.status === "approved" ? "Approved" : r.status === "edited" ? "Edited" : "Rejected"} by Raghav
        </Tag>
        <span className="font-medium">{text}</span>
      </div>
      {r.decision_reason && <p className="text-muted">“{r.decision_reason}”</p>}
    </div>
  );
}

function DecisionControls({ r }: { r: Rec }) {
  const outside = r.action === "RAGHAV_DECIDES";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {!outside && (
          <form action={decide}>
            <input type="hidden" name="recId" value={r.id} />
            <input type="hidden" name="decision" value="approved" />
            <SubmitButton variant="primary" icon="check" pendingText="Approving…">
              Approve{r.qty > 0 ? ` ${fmt(r.qty)}` : ""}
            </SubmitButton>
          </form>
        )}
        <details className="group/ed" open={outside}>
          <summary className={buttonClass("secondary")}>
            <Icon name="pencil" className="h-3.5 w-3.5" />
            {outside ? "Set quantity" : "Edit"}
          </summary>
          <form action={decide} className="mt-2 flex flex-wrap items-center gap-2">
            <input type="hidden" name="recId" value={r.id} />
            <input type="hidden" name="decision" value="edited" />
            <input
              name="qty"
              type="number"
              min={0}
              step={1}
              defaultValue={r.qty || r.std_qty}
              className="field num w-24 text-right"
              aria-label="Quantity"
            />
            <input name="reason" required placeholder="Why this quantity?" className="field min-w-0 flex-1" aria-label="Reason for the quantity" />
            <SubmitButton variant="primary" pendingText="Saving…">
              Save
            </SubmitButton>
          </form>
        </details>
        <details className="group/rj">
          <summary className={buttonClass("danger")}>
            <Icon name="x" className="h-3.5 w-3.5" />
            Reject
          </summary>
          <form action={decide} className="mt-2 flex flex-wrap items-center gap-2">
            <input type="hidden" name="recId" value={r.id} />
            <input type="hidden" name="decision" value="rejected" />
            <input name="reason" required placeholder="Reason for rejecting" className="field min-w-0 flex-1" aria-label="Reason for rejecting" />
            <SubmitButton variant="danger" pendingText="Rejecting…">
              Confirm
            </SubmitButton>
          </form>
        </details>
      </div>
    </div>
  );
}
