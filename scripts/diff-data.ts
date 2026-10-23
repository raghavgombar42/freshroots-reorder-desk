/** Read-only: compare what's in Supabase with the case CSVs, and list everything else that changed. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "../lib/db";
import { parseCsv, toSales, toSkus, toStock } from "../lib/csv";

const load = (f: string) => parseCsv(readFileSync(join(__dirname, "..", "data", f), "utf8"));
(async () => {
  const sql = db();
  const out: string[] = [];
  const skus = await sql`select * from skus`;
  const csvSkus = toSkus(load("sku_master.csv"));
  for (const c of csvSkus) {
    const d = skus.find((s) => s.id === c.id);
    if (!d) out.push(`SKU ${c.id} missing in DB`);
    else if (d.name !== c.name || d.perishability !== c.perishability || d.std_qty !== c.stdQty || d.distributor_id !== c.distributorId)
      out.push(`SKU ${c.id} changed: ${JSON.stringify({ name: d.name, perishability: d.perishability, std_qty: d.std_qty, distributor_id: d.distributor_id })}`);
  }
  for (const d of skus) if (!csvSkus.some((c) => c.id === d.id)) out.push(`Extra SKU in DB: ${d.id} ${d.name}`);
  const sales = await sql`select sku_id, week, units from weekly_sales`;
  const csvSales = toSales(load("weekly_sales.csv"));
  for (const c of csvSales) {
    const d = sales.find((s) => s.sku_id === c.skuId && s.week === c.week);
    if (!d) out.push(`Sales ${c.skuId} ${c.week} missing`);
    else if (d.units !== c.units) out.push(`Sales ${c.skuId} ${c.week}: CSV ${c.units} → DB ${d.units}`);
  }
  if (sales.length !== csvSales.length) out.push(`Sales rows: CSV ${csvSales.length}, DB ${sales.length}`);
  const stock = await sql`select sku_id, location, units, as_of::text from stock_snapshots order by as_of, sku_id`;
  for (const c of toStock(load("current_inventory.csv"))) {
    const d = stock.find((s) => s.sku_id === c.skuId && s.as_of === c.asOf);
    if (!d) out.push(`Stock ${c.skuId} ${c.asOf} missing`);
    else if (d.units !== c.units) out.push(`Stock ${c.skuId} ${c.asOf}: CSV ${c.units} → DB ${d.units}`);
  }
  const extraStock = stock.filter((s) => s.as_of !== "2026-10-19");
  if (extraStock.length) out.push(`Stock rows with other dates: ${extraStock.length} (${[...new Set(extraStock.map((s) => s.as_of))].join(", ")})`);
  const counts = await sql`select (select count(*) from rule_settings)::int as rule_versions, (select count(*) from decisions)::int as decisions,
    (select count(*) from po_lines)::int as po_lines, (select count(*) from loss_entries)::int as loss_entries, (select count(*) from uploads)::int as uploads,
    (select count(*) from runs)::int as runs, (select count(*) from calendar_months where festival)::int as festival_months, (select count(*) from distributors)::int as distributors`;
  console.log(out.length ? out.join("\n") : "SKUs, sales and 19 Oct stock match the case CSVs exactly.");
  console.log(counts[0]);
  const rs = await sql`select version, note, settings from rule_settings order by version`;
  for (const r of rs) console.log(`rules v${r.version}: ${r.note}`);
  await sql.end();
})();
