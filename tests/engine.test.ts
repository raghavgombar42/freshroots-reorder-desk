/**
 * Eval set for the engine (cards 3–6), fixed BEFORE the build.
 * Expected answers worked out by hand from Raghav's written rules on the case data (run date 20 Oct 2026, a festival month).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SETTINGS, runEngine, validate, ValidationError, type Settings } from "../lib/engine";
import { parseCsv, toMonths, toSales, toSkus, toStock } from "../lib/csv";

const load = (f: string) => parseCsv(readFileSync(join(__dirname, "..", "data", f), "utf8"));
const base = {
  skus: toSkus(load("sku_master.csv")),
  sales: toSales(load("weekly_sales.csv")),
  stock: toStock(load("current_inventory.csv")),
  months: toMonths(load("calendar.csv")),
  runDate: "2026-10-20",
  settings: DEFAULT_SETTINGS,
};
const run = (over: Partial<typeof base> & { settings?: Settings } = {}) => {
  const out = runEngine({ ...base, ...over });
  return Object.fromEntries(out.recommendations.map((r) => [r.skuId, r]));
};

test("1. Mango Drink (SKU001): high demand + stockout → reorder now at 1.5× = 750", () => {
  const r = run().SKU001;
  assert.equal(r.action, "REORDER_NOW");
  assert.equal(r.qty, 750);
  assert.equal(r.metrics.weeksOfCover, 3.4);
});

test("2. Stockout risk at standard qty: SKU003 300, SKU013 120", () => {
  const r = run();
  assert.deepEqual([r.SKU003.action, r.SKU003.qty], ["REORDER_NOW", 300]);
  assert.deepEqual([r.SKU013.action, r.SKU013.qty], ["REORDER_NOW", 120]);
});

test("3. Perishables below 3 weeks: Almond Milk 150, Multigrain Bread 500", () => {
  const r = run();
  assert.deepEqual([r.SKU004.action, r.SKU004.qty], ["REORDER_NOW", 150]);
  assert.deepEqual([r.SKU011.action, r.SKU011.qty], ["REORDER_NOW", 500]);
});

test("4. Quinoa (SKU006) 22 weeks of cover → pause", () => {
  assert.equal(run().SKU006.action, "PAUSE");
});

test("5. Coconut Water (SKU007): demand up 10% but perishable cover 4.1 > 4 → pause", () => {
  const r = run().SKU007;
  assert.equal(r.action, "PAUSE");
  assert.equal(r.qty, 0);
});

test("6. The other 8 SKUs: no action; 7 of 15 flagged overall", () => {
  const r = run();
  const flagged = Object.values(r).filter((x) => x.action !== "NO_ACTION").map((x) => x.skuId).sort();
  assert.deepEqual(flagged, ["SKU001", "SKU003", "SKU004", "SKU006", "SKU007", "SKU011", "SKU013"]);
});

test("7. Festival uplift matters: in a non-festival month Oats Cookies (SKU002) flips to overstock (14.3 wks)", () => {
  const r = run({ runDate: "2026-10-20", months: base.months.map((m) => ({ ...m, festival: false })) }).SKU002;
  assert.equal(r.action, "PAUSE");
  assert.equal(r.metrics.weeksOfCover, 14.3);
});

test("8. New launch with < 12 weeks of history → Raghav decides, no quantity", () => {
  const sales = base.sales.filter((s) => !(s.skuId === "SKU005" && s.week < "2026-W35"));
  const r = run({ sales }).SKU005;
  assert.equal(r.action, "RAGHAV_DECIDES");
  assert.equal(r.qty, 0);
});

test("9. Missing stock row → run is blocked, never guessed", () => {
  const stock = base.stock.filter((s) => s.skuId !== "SKU009");
  assert.throws(() => runEngine({ ...base, stock }), ValidationError);
});

test("10. Stale stock snapshot (older than 3 days) → run is blocked", () => {
  const problems = validate({ ...base, runDate: "2026-10-30" });
  assert.ok(problems.some((p) => p.includes("days old")));
});

test("11. Gap in weeks → run is blocked", () => {
  const sales = base.sales.filter((s) => !(s.skuId === "SKU010" && s.week === "2026-W33"));
  assert.ok(validate({ ...base, sales }).some((p) => p.includes("gap in weeks")));
});

test("12. Raghav edits a rule number (stockout 6 → 4 wks): Brown Rice (4.4 wks) no longer reorders", () => {
  const r = run({ settings: { ...DEFAULT_SETTINGS, stockoutWeeks: 4 } }).SKU003;
  assert.equal(r.action, "NO_ACTION");
});
