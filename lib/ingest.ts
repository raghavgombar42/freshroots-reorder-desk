import { db } from "./db";
import { detectKind, parseCsv, toMonths, toSales, toSkus, toStock, type FileKind } from "./csv";

/**
 * Card 2: load one SAP export file into Supabase. Upserts, so loading the same file twice changes nothing.
 * Basic row checks happen here; the full card-3 validation runs at the start of every run.
 */
export async function ingestCsv(text: string, filename: string): Promise<{ kind: FileKind; rows: number }> {
  const kind = detectKind(text);
  if (!kind) throw new Error(`${filename}: header row doesn't match any SAP export (sku_master, weekly_sales, current_inventory, distributor_master, calendar).`);
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error(`${filename}: no data rows.`);
  const sql = db();

  await sql.begin(async (tx) => {
    if (kind === "sku_master") {
      for (const s of toSkus(rows)) {
        if (!s.id || !(s.stdQty > 0) || !["Low", "High"].includes(s.perishability)) throw new Error(`${filename}: bad row for ${s.id || "(no id)"}`);
        await tx`insert into skus (id, name, category, perishability, std_qty, distributor_id)
          values (${s.id}, ${s.name}, ${s.category}, ${s.perishability}, ${s.stdQty}, ${s.distributorId})
          on conflict (id) do update set name = excluded.name, category = excluded.category, perishability = excluded.perishability,
            std_qty = excluded.std_qty, distributor_id = excluded.distributor_id`;
      }
    } else if (kind === "weekly_sales") {
      const sales = toSales(rows);
      for (const r of sales) if (!Number.isFinite(r.units) || r.units < 0) throw new Error(`${filename}: bad units for ${r.skuId} ${r.week}`);
      // One statement for the whole file (row-by-row inserts were slow over the pooler).
      for (let i = 0; i < sales.length; i += 500)
        await tx`insert into weekly_sales ${tx(sales.slice(i, i + 500).map((r) => ({ sku_id: r.skuId, week: r.week, units: r.units })))}
          on conflict (sku_id, week) do update set units = excluded.units`;
    } else if (kind === "current_inventory") {
      const stock = toStock(rows);
      for (const r of stock) if (!Number.isFinite(r.units) || r.units < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(r.asOf)) throw new Error(`${filename}: bad stock row for ${r.skuId}`);
      await tx`insert into stock_snapshots ${tx(stock.map((r) => ({ sku_id: r.skuId, location: r.location, units: r.units, as_of: r.asOf })))}
          on conflict (sku_id, location, as_of) do update set units = excluded.units, loaded_at = now()`;
    } else if (kind === "distributor_master") {
      for (const r of rows)
        await tx`insert into distributors (id, name, region, status) values (${r.Distributor_ID}, ${r.Distributor_Name}, ${r.Region}, ${r.Status})
          on conflict (id) do update set name = excluded.name, region = excluded.region, status = excluded.status`;
    } else if (kind === "calendar") {
      for (const m of toMonths(rows))
        await tx`insert into calendar_months (year_month, festival) values (${m.yearMonth}, ${m.festival})
          on conflict (year_month) do update set festival = excluded.festival`;
    }
    await tx`insert into uploads (kind, filename, rows) values (${kind}, ${filename}, ${rows.length})`;
  });
  return { kind, rows: rows.length };
}
