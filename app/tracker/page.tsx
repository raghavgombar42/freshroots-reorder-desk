import { db, withDb } from "@/lib/db";
import { isOperator } from "@/lib/auth";
import type { Metrics } from "@/lib/engine";
import { addLoss } from "../actions";
import { SubmitButton } from "../buttons";
import { Icon } from "../icons";
import { Card, EmptyState, Flash, NoDb, Notice, PageHeader, Stat, Table, Tag, lakh, type SP } from "../ui";

export const dynamic = "force-dynamic";

// Pre-build decision: the outcome is ₹ lost to stockouts + overstock write-offs. Baseline from the case brief.
const BASELINE_LOW = 28_00_000; // ₹ per quarter
const BASELINE_HIGH = 34_00_000;
const QUARTER_DAYS = 91;

type Loss = { id: number; period_start: string; period_end: string; stockout_inr: string; writeoff_inr: string; note: string | null };

async function load() {
  const sql = db();
  const losses = (await sql`select * from loss_entries order by period_start`) as unknown as Loss[];
  const [rate] = await sql`select count(*) filter (where decision = 'rejected')::int as rejected, count(*)::int as decided,
    count(*) filter (where decision = 'edited')::int as edited from decisions`;
  // Card F: forecast vs actual depletion. Each run's weekly demand estimate vs the sales that arrived after it.
  const recs = await sql`select r.run_id, r.sku_id, r.metrics from recommendations r join runs u on u.id = r.run_id where u.status = 'ok' order by r.run_id`;
  const sales = await sql`select sku_id, week, units from weekly_sales`;
  const stockTrend = await sql`select as_of, sum(units)::int as units from stock_snapshots group by as_of order by as_of`;
  return { losses, rate, recs, sales, stockTrend };
}

export default async function Tracker({ searchParams }: { searchParams: SP }) {
  let d;
  try {
    d = await withDb(load);
  } catch (e) {
    return <NoDb error={e} />;
  }
  const operator = await isOperator();
  const rejectPct = d.rate.decided ? Math.round((d.rate.rejected / d.rate.decided) * 100) : 0;

  const periods = d.losses.map((l) => {
    const days = Math.round((Date.parse(l.period_end) - Date.parse(l.period_start)) / 864e5);
    const total = Number(l.stockout_inr) + Number(l.writeoff_inr);
    const low = (BASELINE_LOW * days) / QUARTER_DAYS;
    const high = (BASELINE_HIGH * days) / QUARTER_DAYS;
    const verdict = total > high ? "up" : total < low ? "down" : "same";
    return { ...l, days, total, low, high, verdict };
  });
  const last = periods.at(-1);

  // Card F: for each SKU, the latest run whose estimate has actual weeks after it.
  const salesBy = new Map<string, { week: string; units: number }[]>();
  for (const s of d.sales) salesBy.set(s.sku_id, [...(salesBy.get(s.sku_id) ?? []), { week: s.week, units: s.units }]);
  const fb = new Map<string, { runId: number; forecast: number; actual: number; weeks: number }>();
  for (const r of d.recs) {
    const m = r.metrics as Metrics;
    const after = (salesBy.get(r.sku_id) ?? []).filter((s) => m.lastWeek && s.week > m.lastWeek);
    if (after.length === 0) continue;
    const actual = after.reduce((a, s) => a + s.units, 0) / after.length;
    fb.set(r.sku_id, { runId: Number(r.run_id), forecast: m.weeklyDemand, actual: Math.round(actual * 10) / 10, weeks: after.length });
  }

  const rejectTriggered = rejectPct > 50 && d.rate.decided >= 5;
  const lossTriggered = last?.verdict === "up";

  return (
    <div className="space-y-6">
      <Flash searchParams={searchParams} />

      <PageHeader
        eyebrow={
          <>
            <span className="rounded-full bg-rail px-2 py-0.5 text-[11px] font-semibold text-white">Step 3 of 3</span>
            <span>Outcome vs baseline · card 13</span>
          </>
        }
        title="Loss tracker"
        description={
          <>
            The outcome is <b className="font-semibold text-ink">₹ lost to stockouts plus overstock write-offs</b>. Time saved is an output, not the
            outcome. Every 3–4 weeks the actual losses are compared with the same measure from before the desk existed.
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon="history" label="Baseline (before the desk)" value="₹28–34 L / qtr" sub="Stockouts ₹18–22 L + write-offs ₹10–12 L (case brief)" />
        <Stat
          icon="chart"
          label="Latest period"
          tone={last?.verdict === "up" ? "cut" : last?.verdict === "down" ? "data" : undefined}
          value={last ? lakh(last.total) : "—"}
          sub={last ? `${last.period_start} → ${last.period_end} · baseline ${lakh(last.low)}–${lakh(last.high)}` : "No loss period entered yet"}
        />
        <Stat
          icon="user"
          label="Raghav rejects"
          tone={rejectPct > 50 ? "cut" : undefined}
          value={d.rate.decided ? `${rejectPct}%` : "—"}
          sub={`${d.rate.rejected} rejected, ${d.rate.edited} edited, of ${d.rate.decided}`}
        />
        <Stat icon="clock" label="Forecast checks" value={fb.size} sub="SKUs with actual sales after a run (card F)" />
      </div>

      <Card
        icon="shield"
        title="Kill criteria"
        subtitle="Fixed before the pilot started, so the goalposts can't move later."
        tone={rejectTriggered || lossTriggered ? "cut" : "data"}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className={`rounded-lg border p-3.5 ${rejectTriggered ? "border-cut/30 bg-cut-soft" : "border-line bg-paper/60"}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold">1 · Early signal: Raghav&apos;s rejections</span>
              {rejectTriggered ? <Tag tone="cut">Triggered</Tag> : <Tag tone="data">Not triggered</Tag>}
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink/80">If Raghav rejects more than 50% of recommendations, flag it and re-evaluate the rules.</p>
            <p className="mt-2 text-[13px]">
              <b className="font-semibold">Now: {d.rate.decided ? `${rejectPct}%` : "no decisions yet"}</b>
              {d.rate.decided > 0 && d.rate.decided < 5 && <span className="text-muted"> (too few decisions to judge)</span>}
            </p>
          </div>
          <div className={`rounded-lg border p-3.5 ${lossTriggered ? "border-cut/30 bg-cut-soft" : "border-line bg-paper/60"}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold">2 · Outcome: losses go up</span>
              {lossTriggered ? <Tag tone="cut">Triggered: stop</Tag> : <Tag tone="data">Not triggered</Tag>}
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink/80">
              If losses rise instead of fall, the automation is doing the opposite of its job: stop immediately, find the root cause, fix, redeploy.
            </p>
            <p className="mt-2 text-[13px]">
              {last ? (
                <b className="font-semibold">
                  Latest period: {lakh(last.total)} vs baseline {lakh(last.low)}–{lakh(last.high)}
                </b>
              ) : (
                <span className="text-muted">No loss period entered yet.</span>
              )}
            </p>
          </div>
        </div>
      </Card>

      <Card icon="chart" title="Loss periods" subtitle="Entered by Deepa from finance figures. The case data has no prices, so the desk can't compute ₹ itself.">
        {periods.length === 0 ? (
          <EmptyState icon="chart" title="No periods yet">
            Deepa enters actual stockout and write-off ₹ every 3–4 weeks. The baseline for each period is pro-rated from ₹28–34 L per quarter.
          </EmptyState>
        ) : (
          <Table head={["Period", "Stockout", "Write-off", "Total", "Baseline for period", "vs baseline"]} minWidth={720}>
            {periods.map((p) => (
              <tr key={p.id}>
                <td className="whitespace-nowrap">
                  {p.period_start} → {p.period_end} <span className="text-muted">({p.days} d)</span>
                </td>
                <td className="tabular-nums">{lakh(Number(p.stockout_inr))}</td>
                <td className="tabular-nums">{lakh(Number(p.writeoff_inr))}</td>
                <td className="font-semibold tabular-nums">{lakh(p.total)}</td>
                <td className="tabular-nums text-muted">
                  {lakh(p.low)}–{lakh(p.high)}
                </td>
                <td>
                  {p.verdict === "down" ? <Tag tone="data">Below baseline</Tag> : p.verdict === "up" ? <Tag tone="cut">Above: stop</Tag> : <Tag>Within range</Tag>}
                  {p.note && <span className="ml-2 text-muted">{p.note}</span>}
                </td>
              </tr>
            ))}
          </Table>
        )}
        {operator && (
          <form action={addLoss} className="mt-5 rounded-lg border border-line bg-paper/60 p-4">
            <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold">
              <Icon name="pencil" className="h-3.5 w-3.5 text-muted" /> Add a loss period
            </div>
            <div className="flex flex-wrap items-end gap-3 text-[12px] font-medium text-muted">
              <label className="flex flex-col gap-1">
                From
                <input type="date" name="start" required className="field" />
              </label>
              <label className="flex flex-col gap-1">
                To
                <input type="date" name="end" required className="field" />
              </label>
              <label className="flex flex-col gap-1">
                Stockout loss (₹ L)
                <input type="number" name="stockout" step="0.1" min="0" required className="field w-32" />
              </label>
              <label className="flex flex-col gap-1">
                Write-off (₹ L)
                <input type="number" name="writeoff" step="0.1" min="0" required className="field w-32" />
              </label>
              <label className="flex flex-1 flex-col gap-1">
                Note (optional)
                <input name="note" className="field min-w-48" />
              </label>
              <SubmitButton variant="human" pendingText="Saving…">
                Add period
              </SubmitButton>
            </div>
          </form>
        )}
      </Card>

      <Card icon="clock" title="Early warning: forecast vs actual" subtitle="Card F. A signal weeks before the ₹ loss shows up.">
        {fb.size === 0 ? (
          <Notice tone="info" title="Waiting for new sales weeks">
            When the next weekly SAP sales export is loaded, each SKU&apos;s estimated weekly demand from a run is compared with what actually sold. A gap
            above 20% is the early warning.
          </Notice>
        ) : (
          <Table head={["SKU", "Run", "Estimated / wk", "Actual / wk", "Gap"]}>
            {[...fb].map(([sku, f]) => {
              const gap = f.actual ? Math.round(((f.actual - f.forecast) / f.actual) * 100) : 0;
              return (
                <tr key={sku}>
                  <td className="font-semibold">{sku}</td>
                  <td>#{f.runId}</td>
                  <td className="tabular-nums">{f.forecast}</td>
                  <td className="tabular-nums">
                    {f.actual} <span className="text-muted">({f.weeks} wk)</span>
                  </td>
                  <td>{Math.abs(gap) > 20 ? <Tag tone="cut">{gap}%</Tag> : <Tag tone="data">{gap}%</Tag>}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <Card
        icon="box"
        title="Counter-metric: total stock on hand"
        subtitle="More reorders must not quietly pile up stock. The case data has no unit prices, so this tracks units across all SKUs."
      >
        <div className="flex flex-wrap gap-2">
          {d.stockTrend.map((s) => (
            <span key={s.as_of} className="rounded-lg border border-line bg-paper/60 px-3 py-2 text-[13px] tabular-nums">
              <span className="text-muted">{s.as_of}</span> <b className="ml-1 font-semibold">{Number(s.units).toLocaleString("en-IN")}</b>
              <span className="text-muted"> units</span>
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}
