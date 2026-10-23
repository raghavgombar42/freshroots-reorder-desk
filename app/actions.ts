"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, withDb } from "@/lib/db";
import { clearOperatorCookie, passcodeMatches, requireOperator, setOperatorCookie } from "@/lib/auth";
import { ingestCsv } from "@/lib/ingest";
import { runPipeline, todayIST } from "@/lib/pipeline";
import { SETTINGS_SCHEMA, currentSettings } from "@/lib/settings";
import type { Settings } from "@/lib/engine";
import { pushRunToZoho } from "@/lib/zoho";

function back(path: string, msg: string, ok = true): never {
  redirect(`${path}?${ok ? "ok" : "err"}=${encodeURIComponent(msg)}`);
}

export async function unlock(form: FormData) {
  if (!passcodeMatches(String(form.get("passcode") ?? ""))) back("/unlock", "Wrong passcode", false);
  await setOperatorCookie();
  redirect("/");
}

export async function lock() {
  await clearOperatorCookie();
  redirect("/");
}

/** Card 0: Raghav's off-cycle run. Same code path as the Mon/Thu cron. */
export async function runNow() {
  return withDb(() => runNowWork());
}
async function runNowWork() {
  await requireOperator();
  let msg: string;
  let ok = true;
  try {
    const r = await runPipeline("run_now");
    msg = r.status === "ok" ? `Run #${r.runId} done.${r.problems.length ? " " + r.problems.join(" ") : ""}` : `Run #${r.runId} ${r.status}: ${r.problems[0]}`;
    ok = r.status === "ok";
  } catch (e) {
    msg = (e as Error).message;
    ok = false;
  }
  revalidatePath("/", "layout");
  back("/", msg, ok);
}

/**
 * Card 9: Raghav's decision on one recommendation. One-way: only a pending recommendation can be decided.
 * Approved or edited reorders become draft PO lines (card 10). Rejections and edits need a reason (card 11).
 */
export async function decide(form: FormData) {
  return withDb(() => decideWork(form));
}
async function decideWork(form: FormData) {
  await requireOperator();
  const recId = Number(form.get("recId"));
  const decision = String(form.get("decision")) as "approved" | "edited" | "rejected";
  const reason = String(form.get("reason") ?? "").trim() || null;
  const qtyRaw = form.get("qty");
  const sql = db();
  const [rec] = await sql`select r.id, r.run_id, r.sku_id, r.action, r.qty, r.status, s.distributor_id
    from recommendations r join skus s on s.id = r.sku_id where r.id = ${recId}`;
  if (!rec) back("/", "Recommendation not found", false);
  if (rec.status !== "pending") back("/", `${rec.sku_id} was already decided`, false);
  if (!["approved", "edited", "rejected"].includes(decision)) back("/", "Unknown decision", false);
  if ((decision === "rejected" || decision === "edited") && !reason) back("/", `${rec.sku_id}: give a reason for the ${decision === "edited" ? "edit" : "rejection"}`, false);

  let finalQty: number | null = null;
  if (decision === "approved") {
    if (rec.action === "RAGHAV_DECIDES") back("/", `${rec.sku_id} is outside the rules: enter your own quantity (Edit) or reject it`, false);
    finalQty = rec.qty;
  } else if (decision === "edited") {
    finalQty = Number(qtyRaw);
    if (!Number.isInteger(finalQty) || finalQty < 0 || finalQty > 100000) back("/", `${rec.sku_id}: quantity must be a whole number 0–100,000`, false);
  }

  await sql.begin(async (tx) => {
    const upd = await tx`update recommendations set status = ${decision} where id = ${recId} and status = 'pending' returning id`;
    if (upd.length === 0) throw new Error("Already decided");
    await tx`insert into decisions (recommendation_id, decision, final_qty, reason) values (${recId}, ${decision}, ${finalQty}, ${reason})`;
    if (finalQty && finalQty > 0)
      await tx`insert into po_lines (run_id, recommendation_id, sku_id, vendor_id, qty)
        values (${rec.run_id}, ${recId}, ${rec.sku_id}, ${rec.distributor_id}, ${finalQty})`;
  });
  revalidatePath("/", "layout");
  back("/", `${rec.sku_id}: ${decision}${finalQty ? `, ${finalQty} units to draft PO` : ""}`);
}

/** Card 9, bulk: approve every pending rule-based recommendation in a run (never the "Raghav decides" ones). */
export async function approveAllRuleRecs(form: FormData) {
  return withDb(() => approveAllRuleRecsWork(form));
}
async function approveAllRuleRecsWork(form: FormData) {
  await requireOperator();
  const runId = Number(form.get("runId"));
  const sql = db();
  const recs = await sql`select r.id, r.sku_id, r.qty, s.distributor_id from recommendations r join skus s on s.id = r.sku_id
    where r.run_id = ${runId} and r.status = 'pending' and r.action in ('REORDER_NOW', 'REORDER_UP', 'PAUSE')`;
  await sql.begin(async (tx) => {
    for (const r of recs) {
      const upd = await tx`update recommendations set status = 'approved' where id = ${r.id} and status = 'pending' returning id`;
      if (upd.length === 0) continue;
      await tx`insert into decisions (recommendation_id, decision, final_qty) values (${r.id}, 'approved', ${r.qty})`;
      if (r.qty > 0) await tx`insert into po_lines (run_id, recommendation_id, sku_id, vendor_id, qty) values (${runId}, ${r.id}, ${r.sku_id}, ${r.distributor_id}, ${r.qty})`;
    }
  });
  revalidatePath("/", "layout");
  back("/", `Approved ${recs.length} rule-based recommendations`);
}

/** Card R: Raghav edits the rule numbers. Each save is a new version; old versions stay for the audit trail. */
export async function saveRules(form: FormData) {
  return withDb(() => saveRulesWork(form));
}
async function saveRulesWork(form: FormData) {
  await requireOperator();
  const { settings: current } = await currentSettings();
  const next: Record<string, number | null> = {};
  for (const k of Object.keys(current) as (keyof Settings)[]) {
    const raw = String(form.get(k) ?? "").trim();
    // Only the freshness limit may be blank (= no limit); a blank anywhere else is an error.
    next[k] = raw === "" && k === "maxDataAgeDays" ? null : raw === "" ? NaN : Number(raw);
  }
  const parsed = SETTINGS_SCHEMA.safeParse(next);
  if (!parsed.success) back("/rules", parsed.error.issues.map((i) => `${i.path.join(".") || "rules"}: ${i.message}`).join("; "), false);
  const changed = (Object.keys(current) as (keyof Settings)[]).filter((k) => current[k] !== next[k]);
  if (changed.length === 0) back("/rules", "Nothing changed", false);
  const note = String(form.get("note") ?? "").trim() || `Changed ${changed.join(", ")}`;
  const sql = db();
  const [r] = await sql`insert into rule_settings (settings, note) values (${sql.json(parsed.data)}, ${note}) returning version`;
  revalidatePath("/", "layout");
  back("/rules", `Saved as version ${r.version}. The next run uses it.`);
}

/** Card 2 (pilot): upload a SAP export CSV. */
export async function uploadCsv(form: FormData) {
  return withDb(() => uploadCsvWork(form));
}
async function uploadCsvWork(form: FormData) {
  await requireOperator();
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) back("/upload", "Choose at least one CSV file", false);
  const done: string[] = [];
  try {
    for (const f of files) {
      if (f.size > 5_000_000) throw new Error(`${f.name} is larger than 5 MB`);
      const r = await ingestCsv(await f.text(), f.name);
      done.push(`${f.name} → ${r.kind} (${r.rows} rows)`);
    }
  } catch (e) {
    revalidatePath("/", "layout");
    back("/upload", `${done.length ? `Loaded ${done.join(", ")}. ` : ""}Stopped: ${(e as Error).message}`, false);
  }
  revalidatePath("/", "layout");
  back("/upload", `Loaded ${done.join(", ")}`);
}

/**
 * Pilot only: stand-in for IT's scheduled SAP stock export. Copies the latest stock snapshot to today's date,
 * so the freshness check (card 3) passes in a live demo. Clearly labelled as simulated in the UI.
 */
export async function simulateStockRefresh() {
  return withDb(() => simulateStockRefreshWork());
}
async function simulateStockRefreshWork() {
  await requireOperator();
  const today = todayIST();
  const sql = db();
  const rows = await sql`insert into stock_snapshots (sku_id, location, units, as_of)
    select distinct on (sku_id, location) sku_id, location, units, ${today}::date from stock_snapshots
    order by sku_id, location, as_of desc
    on conflict (sku_id, location, as_of) do nothing returning id`;
  await sql`insert into uploads (kind, filename, rows) values ('current_inventory', ${`simulated SAP refresh ${today}`}, ${rows.length})`;
  revalidatePath("/", "layout");
  back("/upload", `Simulated SAP stock refresh: ${rows.length} rows dated ${today}`);
}

/** Card 13: Deepa enters actual losses for a 3–4 week period. */
export async function addLoss(form: FormData) {
  return withDb(() => addLossWork(form));
}
async function addLossWork(form: FormData) {
  await requireOperator();
  const start = String(form.get("start"));
  const end = String(form.get("end"));
  const stockout = Number(form.get("stockout"));
  const writeoff = Number(form.get("writeoff"));
  const note = String(form.get("note") ?? "").trim() || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end <= start) back("/tracker", "Enter a valid period (end after start)", false);
  if (!(stockout >= 0) || !(writeoff >= 0)) back("/tracker", "Losses must be numbers ≥ 0 (in ₹ lakh)", false);
  await db()`insert into loss_entries (period_start, period_end, stockout_inr, writeoff_inr, note)
    values (${start}, ${end}, ${Math.round(stockout * 100000)}, ${Math.round(writeoff * 100000)}, ${note})`;
  revalidatePath("/", "layout");
  back("/tracker", "Loss period saved");
}

/** Card 12, live: send a run's approved lines to Zoho Inventory as DRAFT POs (one per distributor). */
export async function pushToZoho(form: FormData) {
  return withDb(() => pushToZohoWork(form));
}
async function pushToZohoWork(form: FormData) {
  await requireOperator();
  const runId = Number(form.get("runId"));
  if (!Number.isInteger(runId) || runId <= 0) back("/pos", "Unknown run", false);
  let results;
  try {
    results = await pushRunToZoho(runId);
  } catch (e) {
    back("/pos", (e as Error).message, false);
  }
  revalidatePath("/", "layout");
  const failed = results.filter((r) => r.status === "failed");
  const text = results
    .map((r) => (r.status === "failed" ? `${r.vendor}: failed (${r.error})` : `${r.vendor}: ${r.poNumber}${r.status === "already" ? " (already in Zoho)" : ""}`))
    .join("; ");
  back("/pos", `Zoho draft POs for run #${runId}: ${text || "nothing to send"}`, failed.length === 0);
}
