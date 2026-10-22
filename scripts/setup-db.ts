/**
 * One-time setup: create the tables, then load the five case CSVs (the pilot's SAP export) and Raghav's rules v1.
 * Run: npm run db:setup
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "../lib/db";
import { ingestCsv } from "../lib/ingest";
import { currentSettings } from "../lib/settings";

async function main() {
  const sql = db();
  await sql.unsafe(readFileSync(join(__dirname, "..", "db", "schema.sql"), "utf8"));
  console.log("Schema ready.");
  // Order matters: SKUs before sales and stock (foreign keys).
  for (const f of ["sku_master.csv", "distributor_master.csv", "calendar.csv", "weekly_sales.csv", "current_inventory.csv"]) {
    const r = await ingestCsv(readFileSync(join(__dirname, "..", "data", f), "utf8"), f);
    console.log(`Loaded ${f}: ${r.rows} rows as ${r.kind}`);
  }
  const s = await currentSettings();
  console.log(`Rule settings live: version ${s.version}`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
