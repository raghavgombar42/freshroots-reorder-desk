import { db, withDb } from "@/lib/db";
import { isOperator } from "@/lib/auth";
import type { Metrics } from "@/lib/engine";
import { addLoss } from "../actions";
import { Card, Flash, NoDb, Stat, Tag, lakh, type SP } from "../ui";

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

  return (
    <div className="space-y-5">
      <Flash searchParams={searchParams} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Loss tracker (card 13)</h1>
        <p className="text-sm text-muted">
          Outcome = ₹ lost to stockouts + overstock write-offs. Time saved is an output, not the outcome. Checked every 3–4 weeks against the same metric
          as the baseline.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Baseline (before)" value="₹28–34 L / qtr" sub="Stockouts ₹18–22 L + write-offs ₹10–12 L (case brief)" />
        <Stat label="Latest period" value={last ? lakh(last.total) : "—"} sub={last ? `${last.period_start} → ${last.period_end} · baseline ${lakh(last.low)}–${lakh(last.high)}` : "No loss period entered yet"} />
        <Stat label="Raghav rejects" value={<span className={rejectPct > 50 ? "text-cut" : ""}>{d.rate.decided ? `${rejectPct}%` : "—"}</span>} sub={`${d.rate.rejected} rejected, ${d.rate.edited} edited, of ${d.rate.decided}`} />
        <Stat label="Forecast checks" value={fb.size} sub="SKUs with actual sales after a run (card F)" />
      </div>

      <Card title="Kill criteria (fixed before the run)" tone="cut">
        <ul className="space-y-2 text-sm">
          <li className="flex flex-wrap items-center gap-2">
            {rejectPct > 50 && d.rate.decided >= 5 ? <Tag tone="cut">Triggered</Tag> : <Tag tone="data">Not triggered</Tag>}
            <span>
              <b>Early:</b> Raghav rejects more than 50% of recommendations → flag and re-evaluate the rules. Now: {d.rate.decided ? `${rejectPct}%` : "no decisions yet"}
              {d.rate.decided > 0 && d.rate.decided < 5 && " (too few decisions to judge)"}.
            </span>
          </li>
          <li className="flex flex-wrap items-center gap-2">
            {last?.verdict === "up" ? <Tag tone="cut">Triggered: stop</Tag> : <Tag tone="data">Not triggered</Tag>}
            <span>
              <b>Loss:</b> if losses go up instead of down, the automation is doing the opposite of its job → stop immediately, RCA, fix, redeploy.
              {last && ` Latest period: ${lakh(last.total)} vs baseline ${lakh(last.low)}–${lakh(last.high)}.`}
            </span>
          </li>
        </ul>
      </Card>

      <Card title="Loss periods">
        {periods.length === 0 ? (
          <p className="text-sm text-muted">No periods yet. Deepa enters actual stockout and write-off ₹ every 3–4 weeks (the case gives no live loss data).</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted">
                <tr>
                  <th className="py-1 pr-3">Period</th>
                  <th className="py-1 pr-3">Stockout</th>
                  <th className="py-1 pr-3">Write-off</th>
                  <th className="py-1 pr-3">Total</th>
                  <th className="py-1 pr-3">Baseline for period</th>
                  <th className="py-1">vs baseline</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      {p.period_start} → {p.period_end} <span className="text-muted">({p.days} d)</span>
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums">{lakh(Number(p.stockout_inr))}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{lakh(Number(p.writeoff_inr))}</td>
                    <td className="py-1.5 pr-3 font-semibold tabular-nums">{lakh(p.total)}</td>
                    <td className="py-1.5 pr-3 tabular-nums text-muted">
                      {lakh(p.low)}–{lakh(p.high)}
                    </td>
                    <td className="py-1.5">
                      {p.verdict === "down" ? <Tag tone="data">Below baseline</Tag> : p.verdict === "up" ? <Tag tone="cut">Above: stop</Tag> : <Tag>Within range</Tag>}
                      {p.note && <span className="ml-2 text-muted">{p.note}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {operator && (
          <form action={addLoss} className="mt-4 flex flex-wrap items-end gap-2 text-sm">
            <label className="flex flex-col">
              From
              <input type="date" name="start" required className="rounded-md border border-line px-2 py-1" />
            </label>
            <label className="flex flex-col">
              To
              <input type="date" name="end" required className="rounded-md border border-line px-2 py-1" />
            </label>
            <label className="flex flex-col">
              Stockout loss (₹ L)
              <input type="number" name="stockout" step="0.1" min="0" required className="w-28 rounded-md border border-line px-2 py-1" />
            </label>
            <label className="flex flex-col">
              Write-off (₹ L)
              <input type="number" name="writeoff" step="0.1" min="0" required className="w-28 rounded-md border border-line px-2 py-1" />
            </label>
            <label className="flex flex-col">
              Note
              <input name="note" className="w-56 rounded-md border border-line px-2 py-1" />
            </label>
            <button className="rounded-md bg-human px-3 py-1.5 font-semibold text-white">Add period</button>
          </form>
        )}
      </Card>

      <Card title={<span>Early warning: forecast vs actual depletion <Tag tone="data">card F</Tag></span>}>
        {fb.size === 0 ? (
          <p className="text-sm text-muted">
            Waiting for sales weeks that arrive after a run. When the next weekly SAP sales export is loaded, each SKU&apos;s estimated weekly demand is
            compared with what actually sold. A gap above 20% is the early warning, before the ₹ loss shows up.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted">
              <tr>
                <th className="py-1 pr-3">SKU</th>
                <th className="py-1 pr-3">Run</th>
                <th className="py-1 pr-3">Estimated / wk</th>
                <th className="py-1 pr-3">Actual / wk</th>
                <th className="py-1">Gap</th>
              </tr>
            </thead>
            <tbody>
              {[...fb].map(([sku, f]) => {
                const gap = f.actual ? Math.round(((f.actual - f.forecast) / f.actual) * 100) : 0;
                return (
                  <tr key={sku} className="border-t border-line">
                    <td className="py-1.5 pr-3">{sku}</td>
                    <td className="py-1.5 pr-3">#{f.runId}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{f.forecast}</td>
                    <td className="py-1.5 pr-3 tabular-nums">
                      {f.actual} <span className="text-muted">({f.weeks} wk)</span>
                    </td>
                    <td className="py-1.5">{Math.abs(gap) > 20 ? <Tag tone="cut">{gap}%</Tag> : <Tag tone="data">{gap}%</Tag>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Counter-metric: total stock on hand">
        <p className="mb-2 text-sm text-muted">More reorders must not quietly pile up stock. The case data has no unit prices, so this tracks units across all SKUs.</p>
        <div className="flex flex-wrap gap-3 text-sm">
          {d.stockTrend.map((s) => (
            <span key={s.as_of} className="rounded border border-line px-2 py-1 tabular-nums">
              {s.as_of}: <b>{Number(s.units).toLocaleString("en-IN")}</b>
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}
