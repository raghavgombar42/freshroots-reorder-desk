import { db, withDb } from "@/lib/db";
import { isOperator } from "@/lib/auth";
import type { Metrics } from "@/lib/engine";
import { addLoss } from "../actions";
import { SubmitButton } from "../buttons";
import { Card, EmptyState, Flash, NoDb, Notice, PageHeader, Stat, StatGrid, Step, Table, Tag, lakh, type SP } from "../ui";

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
            <Step n={3} />
            <span>Outcome vs baseline</span>
          </>
        }
        title="Loss tracker"
        description={
          <>
            The outcome is <span className="text-ink">₹ lost to stockouts plus overstock write-offs</span>, not time saved. Every 3–4 weeks actual losses
            are compared with the same measure from before the desk existed.
          </>
        }
      />

      <StatGrid>
        <Stat label="Baseline, before the desk" value="₹28–34 L / qtr" sub="Stockouts ₹18–22 L + write-offs ₹10–12 L (case brief)" />
        <Stat
          label="Latest period"
          tone={last?.verdict === "up" ? "cut" : last?.verdict === "down" ? "data" : undefined}
          value={last ? lakh(last.total) : "—"}
          sub={last ? `${last.period_start} → ${last.period_end} · baseline ${lakh(last.low)}–${lakh(last.high)}` : "No loss period entered yet"}
        />
        <Stat
          label="Raghav rejects"
          tone={rejectPct > 50 ? "cut" : undefined}
          value={d.rate.decided ? `${rejectPct}%` : "—"}
          sub={`${d.rate.rejected} rejected, ${d.rate.edited} edited, of ${d.rate.decided}`}
        />
        <Stat label="Forecast checks" value={fb.size} sub="SKUs with actual sales after a run (card F)" />
      </StatGrid>

      <Card title="Kill criteria" subtitle="Fixed before the pilot started, so the goalposts can't move later." tone={rejectTriggered || lossTriggered ? "cut" : undefined}>
        <div className="grid gap-3 md:grid-cols-2">
          {[
            {
              n: 1,
              title: "Early signal: Raghav's rejections",
              rule: "If Raghav rejects more than 50% of recommendations, flag it and re-evaluate the rules.",
              triggered: rejectTriggered,
              tag: "Triggered",
              now: (
                <>
                  <span className="font-semibold text-ink">Now: {d.rate.decided ? `${rejectPct}%` : "no decisions yet"}</span>
                  {d.rate.decided > 0 && d.rate.decided < 5 && <span> (too few decisions to judge)</span>}
                </>
              ),
            },
            {
              n: 2,
              title: "Outcome: losses go up",
              rule: "If losses rise instead of fall, the automation is doing the opposite of its job: stop immediately, find the root cause, fix, redeploy.",
              triggered: lossTriggered,
              tag: "Triggered: stop",
              now: last ? (
                <span className="font-semibold text-ink">
                  Latest period: {lakh(last.total)} vs baseline {lakh(last.low)}–{lakh(last.high)}
                </span>
              ) : (
                <span>No loss period entered yet.</span>
              ),
            },
          ].map((k) => (
            <div key={k.n} className={`rounded-lg border p-3.5 ${k.triggered ? "border-cut/30 bg-cut-soft" : "border-line"}`}>
              <div className="flex items-start justify-between gap-2">
                <span className="text-[14px] font-semibold">
                  <span className="num mr-1.5 text-faint">{k.n}</span>
                  {k.title}
                </span>
                {k.triggered ? <Tag tone="cut">{k.tag}</Tag> : <Tag tone="data">Not triggered</Tag>}
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{k.rule}</p>
              <p className="mt-2 text-[13px] text-muted">{k.now}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card flush title="Loss periods" subtitle="Entered by Deepa from finance figures. The case data has no prices, so the desk can't compute ₹ itself.">
        {periods.length === 0 ? (
          <EmptyState compact icon="chart" title="No periods yet">
            Deepa enters actual stockout and write-off ₹ every 3–4 weeks. Each period&apos;s baseline is pro-rated from ₹28–34 L per quarter.
          </EmptyState>
        ) : (
          <Table
            head={[
              "Period",
              { label: "Stockout", align: "right" },
              { label: "Write-off", align: "right" },
              { label: "Total", align: "right" },
              { label: "Baseline for period", align: "right" },
              "vs baseline",
            ]}
            minWidth={760}
          >
            {periods.map((p) => (
              <tr key={p.id}>
                <td className="whitespace-nowrap">
                  {p.period_start} → {p.period_end} <span className="text-faint">· {p.days} d</span>
                </td>
                <td className="num text-right">{lakh(Number(p.stockout_inr))}</td>
                <td className="num text-right">{lakh(Number(p.writeoff_inr))}</td>
                <td className="num text-right font-semibold">{lakh(p.total)}</td>
                <td className="num text-right text-muted">
                  {lakh(p.low)}–{lakh(p.high)}
                </td>
                <td>
                  {p.verdict === "down" ? <Tag tone="data">Below baseline</Tag> : p.verdict === "up" ? <Tag tone="cut">Above: stop</Tag> : <Tag>Within range</Tag>}
                  {p.note && <span className="ml-2 text-[13px] text-muted">{p.note}</span>}
                </td>
              </tr>
            ))}
          </Table>
        )}
        {operator && (
          <form action={addLoss} className="border-t border-line bg-sunk/40 px-5 py-4">
            <div className="mb-2.5 text-[13px] font-semibold">Add a loss period</div>
            <div className="flex flex-wrap items-end gap-3 text-[12.5px] text-muted">
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
                <input type="number" name="stockout" step="0.1" min="0" required className="field num w-32 text-right" />
              </label>
              <label className="flex flex-col gap-1">
                Write-off (₹ L)
                <input type="number" name="writeoff" step="0.1" min="0" required className="field num w-32 text-right" />
              </label>
              <label className="flex min-w-48 flex-1 flex-col gap-1">
                Note (optional)
                <input name="note" className="field" />
              </label>
              <SubmitButton variant="primary" size="md" pendingText="Saving…">
                Add period
              </SubmitButton>
            </div>
          </form>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card flush title="Early warning: forecast vs actual" subtitle="Card F. A signal weeks before the ₹ loss shows up.">
          {fb.size === 0 ? (
            <div className="px-5 pb-5">
              <Notice title="Waiting for new sales weeks.">
                When the next weekly SAP sales export is loaded, each SKU&apos;s estimated weekly demand from a run is compared with what actually sold. A
                gap above 20% is the early warning.
              </Notice>
            </div>
          ) : (
            <Table head={["SKU", "Run", { label: "Estimated / wk", align: "right" }, { label: "Actual / wk", align: "right" }, { label: "Gap", align: "right" }]}>
              {[...fb].map(([sku, f]) => {
                const gap = f.actual ? Math.round(((f.actual - f.forecast) / f.actual) * 100) : 0;
                return (
                  <tr key={sku}>
                    <td className="font-medium">{sku}</td>
                    <td className="num text-muted">#{f.runId}</td>
                    <td className="num text-right">{f.forecast}</td>
                    <td className="num text-right">
                      {f.actual} <span className="text-faint">({f.weeks} wk)</span>
                    </td>
                    <td className="text-right">{Math.abs(gap) > 20 ? <Tag tone="cut">{gap}%</Tag> : <Tag tone="data">{gap}%</Tag>}</td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Card>

        <Card title="Counter-metric: stock on hand" subtitle="More reorders must not quietly pile up stock. No unit prices in the case data, so this tracks units.">
          <ul className="divide-y divide-line">
            {d.stockTrend.map((s) => (
              <li key={s.as_of} className="flex items-baseline justify-between py-1.5 text-[13.5px]">
                <span className="text-muted">{s.as_of}</span>
                <span className="num font-semibold">
                  {Number(s.units).toLocaleString("en-IN")} <span className="font-normal text-faint">units</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
