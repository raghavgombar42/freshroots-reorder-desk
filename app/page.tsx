import { db, withDb } from "@/lib/db";
import { isOperator } from "@/lib/auth";
import type { Action, Metrics } from "@/lib/engine";
import { approveAllRuleRecs, decide, runNow } from "./actions";
import { ActionBadge, Card, Flash, NoDb, Stat, Tag, ist, type SP } from "./ui";

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
  const rejectPct = rate.decided ? Math.round((rate.rejected / rate.decided) * 100) : 0;

  return (
    <div className="space-y-5">
      <Flash searchParams={searchParams} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Recommendations</h1>
          <p className="text-sm text-muted">
            Runs Mon + Thu at 7:00 am IST (card 1). Rules decide every action and quantity; Gemini only explains flagged SKUs; Raghav approves.
          </p>
        </div>
        {operator && (
          <form action={runNow}>
            <button className="rounded-lg bg-human px-4 py-2 text-sm font-semibold text-white hover:opacity-90">Run now (card 0)</button>
          </form>
        )}
      </div>

      {latest && latest.status !== "ok" && (
        <Card title={`Latest run #${latest.id} was ${latest.status} (${ist(latest.started_at)})`} tone="cut">
          <ul className="list-disc pl-5 text-sm">
            {(latest.problems as string[]).slice(0, 8).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">The Cut: a bad or stale file stops the run. Nothing is guessed. Showing the last good run below.</p>
        </Card>
      )}

      {!run ? (
        <Card title="No completed run yet">
          <p className="text-sm text-muted">Load the SAP export (SAP data page), then press Run now.</p>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={`Run #${run.id}`} value={ist(run.started_at)} sub={`${run.trigger === "cron" ? "Scheduled" : "Run now"} · rules v${run.rule_version}${run.festival ? " · festival month (+uplift)" : ""}`} />
            <Stat label="Flagged SKUs" value={`${flagged.length} / ${recs.length}`} sub={`${recs.filter((r) => r.action === "RAGHAV_DECIDES").length} outside the rules → Raghav decides`} />
            <Stat
              label="Raghav's reject rate"
              value={<span className={rejectPct > 50 ? "text-cut" : ""}>{rate.decided ? `${rejectPct}%` : "—"}</span>}
              sub={`${rate.rejected} of ${rate.decided} decisions · kill line 50%`}
            />
            <Stat label="AI cost this run" value={`$${Number(cost.usd).toFixed(4)}`} sub={`${cost.calls} Gemini calls · explanations only`} />
          </div>

          {run.summary && (
            <Card title={<span>Cycle summary for Deepa <Tag tone="ai">AI · card 8</Tag></span>} tone="ai">
              <ul className="space-y-1 text-sm">
                {String(run.summary)
                  .split("\n")
                  .map((l) => (
                    <li key={l}>{l}</li>
                  ))}
              </ul>
            </Card>
          )}

          <Card
            title="Needs a decision (card 14 → card 9)"
            right={
              operator && pendingRule > 0 ? (
                <form action={approveAllRuleRecs}>
                  <input type="hidden" name="runId" value={run.id} />
                  <button className="rounded-lg border border-data bg-data-soft px-3 py-1.5 text-sm font-semibold text-data hover:bg-data hover:text-white">
                    Approve all {pendingRule} rule-based recs
                  </button>
                </form>
              ) : null
            }
          >
            <div className="space-y-3">
              {flagged.map((r) => (
                <RecRow key={r.id} r={r} operator={operator} />
              ))}
              {flagged.length === 0 && <p className="text-sm text-muted">Nothing flagged this run.</p>}
            </div>
          </Card>

          <Card title={`No action needed (${quiet.length})`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted">
                  <tr>
                    <th className="py-1 pr-3">SKU</th>
                    <th className="py-1 pr-3">Weeks of cover</th>
                    <th className="py-1 pr-3">4 vs 12-wk</th>
                    <th className="py-1">Reason (code)</th>
                  </tr>
                </thead>
                <tbody>
                  {quiet.map((r) => (
                    <tr key={r.id} className="border-t border-line">
                      <td className="py-1.5 pr-3 whitespace-nowrap">
                        <b>{r.sku_id}</b> {r.name.replace("Freshroots ", "")}
                      </td>
                      <td className="py-1.5 pr-3 tabular-nums">{r.metrics.weeksOfCover ?? "no sales"}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{r.metrics.trendPct > 0 ? "+" : ""}{r.metrics.trendPct}%</td>
                      <td className="py-1.5 text-muted">{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function RecRow({ r, operator }: { r: Rec; operator: boolean }) {
  const m = r.metrics;
  const decided = r.status !== "pending";
  return (
    <div className={`rounded-lg border p-3 ${r.action === "RAGHAV_DECIDES" ? "border-ai/40" : "border-line"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <ActionBadge action={r.action} />
        <b>{r.sku_id}</b>
        <span>{r.name.replace("Freshroots ", "")}</span>
        {r.perishability === "High" && <Tag tone="human">perishable</Tag>}
        {r.qty > 0 && <span className="ml-1 rounded bg-paper px-2 py-0.5 text-sm font-semibold tabular-nums">{r.qty} units</span>}
        <span className="ml-auto text-xs text-muted tabular-nums">
          stock {m.stock} · demand {m.weeklyDemand}/wk · cover {m.weeksOfCover === null ? "— (no sales)" : `${m.weeksOfCover} wks`} · trend {m.trendPct > 0 ? "+" : ""}
          {m.trendPct}%
        </span>
      </div>
      <p className="mt-2 text-sm">
        <Tag>rule · code</Tag> {r.reason}
      </p>
      {(r.ai_unusual || r.ai_check) && (
        <div className="mt-2 rounded-md bg-ai-soft px-3 py-2 text-sm">
          <Tag tone="ai">Gemini · card 7</Tag> {r.ai_unusual} {r.ai_check && <span className="text-muted">Check: {r.ai_check}</span>}
        </div>
      )}
      <div className="mt-3">
        {decided ? (
          <p className="text-sm">
            <Tag tone={r.status === "rejected" ? "cut" : "data"}>{r.status}</Tag>{" "}
            {r.final_qty != null && r.final_qty > 0 ? `${r.final_qty} units → draft PO` : r.status === "rejected" ? "No PO" : "No PO needed"}
            {r.decision_reason && <span className="text-muted"> · “{r.decision_reason}”</span>}
          </p>
        ) : operator ? (
          <div className="flex flex-wrap gap-2">
            {r.action !== "RAGHAV_DECIDES" && (
              <form action={decide}>
                <input type="hidden" name="recId" value={r.id} />
                <input type="hidden" name="decision" value="approved" />
                <button className="rounded-md bg-data px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90">Approve</button>
              </form>
            )}
            <form action={decide} className="flex flex-wrap items-center gap-1">
              <input type="hidden" name="recId" value={r.id} />
              <input type="hidden" name="decision" value="edited" />
              <input name="qty" type="number" min={0} step={1} defaultValue={r.qty || r.std_qty} className="w-24 rounded-md border border-line px-2 py-1 text-sm" aria-label="Quantity" />
              <input name="reason" required placeholder="Why this quantity?" className="w-48 rounded-md border border-line px-2 py-1 text-sm" />
              <button className="rounded-md border border-human px-3 py-1.5 text-sm font-semibold text-human hover:bg-human-soft">
                {r.action === "RAGHAV_DECIDES" ? "Set qty" : "Edit qty"}
              </button>
            </form>
            <form action={decide} className="flex flex-wrap items-center gap-1">
              <input type="hidden" name="recId" value={r.id} />
              <input type="hidden" name="decision" value="rejected" />
              <input name="reason" required placeholder="Reason for rejecting" className="w-48 rounded-md border border-line px-2 py-1 text-sm" />
              <button className="rounded-md border border-cut px-3 py-1.5 text-sm font-semibold text-cut hover:bg-cut-soft">Reject</button>
            </form>
          </div>
        ) : (
          <p className="text-xs text-muted">Pending Raghav&apos;s decision. Unlock to act.</p>
        )}
      </div>
    </div>
  );
}
