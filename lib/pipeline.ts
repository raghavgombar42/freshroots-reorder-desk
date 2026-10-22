import { db } from "./db";
import { runEngine, ValidationError, type MonthRow, type SalesRow, type Sku, type StockRow } from "./engine";
import { currentSettings } from "./settings";
import { cycleSummary, explainFlagged } from "./ai";

/** Today's date in India time (the business runs on IST). */
export function todayIST(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

export type RunResult = { runId: number; status: "ok" | "blocked" | "error"; problems: string[] };

/**
 * One full cycle, cards 1 → 8:
 * lock → load from Supabase → 3 validate → 4–6 engine → store recommendations → 7 AI explains → 8 AI summary.
 * The AI steps are optional: if Gemini fails, the run still completes with the rule decisions.
 */
export async function runPipeline(trigger: "cron" | "run_now", runDate = todayIST()): Promise<RunResult> {
  const sql = db();
  // A run stuck for >10 min (crashed instance) must not block every future run.
  await sql`update runs set status = 'error', problems = '["Run did not finish (timed out)"]', finished_at = now()
            where status = 'running' and started_at < now() - interval '10 minutes'`;

  const { version, settings } = await currentSettings();
  let runId: number;
  try {
    const [r] = await sql`insert into runs (trigger, run_date, status, rule_version) values (${trigger}, ${runDate}, 'running', ${version}) returning id`;
    runId = Number(r.id);
  } catch {
    throw new Error("Another run is already in progress. Try again in a minute.");
  }

  try {
    const [skuRows, salesRows, stockRows, monthRows] = await Promise.all([
      sql`select id, name, category, perishability, std_qty, distributor_id from skus order by id`,
      sql`select sku_id, week, units from weekly_sales`,
      sql`select distinct on (sku_id, location) sku_id, location, units, as_of from stock_snapshots order by sku_id, location, as_of desc`,
      sql`select year_month, festival from calendar_months`,
    ]);
    const skus: Sku[] = skuRows.map((r) => ({ id: r.id, name: r.name, category: r.category, perishability: r.perishability, stdQty: r.std_qty, distributorId: r.distributor_id }));
    const sales: SalesRow[] = salesRows.map((r) => ({ skuId: r.sku_id, week: r.week, units: r.units }));
    const stock: StockRow[] = stockRows.map((r) => ({ skuId: r.sku_id, location: r.location, units: r.units, asOf: r.as_of }));
    const months: MonthRow[] = monthRows.map((r) => ({ yearMonth: r.year_month, festival: r.festival }));

    let result;
    try {
      result = runEngine({ skus, sales, stock, months, runDate, settings });
    } catch (e) {
      if (e instanceof ValidationError) {
        await sql`update runs set status = 'blocked', problems = ${sql.json(e.problems)}, finished_at = now() where id = ${runId}`;
        return { runId, status: "blocked", problems: e.problems };
      }
      throw e;
    }

    await sql.begin(async (tx) => {
      for (const r of result.recommendations)
        await tx`insert into recommendations (run_id, sku_id, action, qty, rules_fired, exceptions, reason, metrics)
          values (${runId}, ${r.skuId}, ${r.action}, ${r.qty}, ${tx.json(r.rulesFired)}, ${tx.json(r.exceptions)}, ${r.reason}, ${tx.json(r.metrics)})`;
      await tx`update runs set festival = ${result.festival} where id = ${runId}`;
    });

    // Card 7: AI explains flagged recommendations (words only).
    const aiProblems: string[] = [];
    try {
      const notes = await explainFlagged(runId, result.recommendations);
      for (const [skuId, n] of notes)
        await sql`update recommendations set ai_unusual = ${n.unusual}, ai_check = ${n.check} where run_id = ${runId} and sku_id = ${skuId}`;
    } catch (e) {
      aiProblems.push(`AI explanations unavailable: ${(e as Error).message}`);
    }

    // Card 8: 3-line summary for Deepa, compared with the previous completed run.
    try {
      const prev = await sql`select rc.sku_id, rc.action from recommendations rc
        where rc.run_id = (select id from runs where status = 'ok' and id < ${runId} order by id desc limit 1)`;
      const summary = await cycleSummary(runId, result.recommendations, prev.map((p) => ({ skuId: p.sku_id, action: p.action })));
      await sql`update runs set summary = ${summary} where id = ${runId}`;
    } catch (e) {
      aiProblems.push(`AI summary unavailable: ${(e as Error).message}`);
    }

    await sql`update runs set status = 'ok', problems = ${sql.json(aiProblems)}, finished_at = now() where id = ${runId}`;
    return { runId, status: "ok", problems: aiProblems };
  } catch (e) {
    const msg = (e as Error).message;
    await sql`update runs set status = 'error', problems = ${sql.json([msg])}, finished_at = now() where id = ${runId}`;
    return { runId, status: "error", problems: [msg] };
  }
}
