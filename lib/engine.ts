/**
 * The Reorder Desk engine: cards 3–6 of the components map.
 * Plain, deterministic code. No AI and no database in here, so every number can be tested.
 *
 *   3 validate  → 4 compute per SKU → 5 apply Raghav's rules in a fixed order → 6 route exceptions
 *
 * The AI (card 7) only explains what this file decides; it never changes an action or a quantity.
 */

export type Perishability = "Low" | "High";

export type Sku = {
  id: string;
  name: string;
  category: string;
  perishability: Perishability;
  stdQty: number;
  distributorId: string;
};

export type SalesRow = { skuId: string; week: string; units: number }; // week = "2026-W27"
export type StockRow = { skuId: string; location: string; units: number; asOf: string }; // asOf = "2026-10-19"
export type MonthRow = { yearMonth: string; festival: boolean }; // "2026-10"

/** Card R: Raghav's rule numbers. Stored in the database, versioned, editable by him; never in a prompt. */
export type Settings = {
  highDemandPct: number; // 4-wk avg more than this % above 12-wk avg → high demand
  highDemandMultiplier: number; // reorder at this × standard qty
  stockoutWeeks: number; // cover below → reorder now (low perishability)
  overstockWeeks: number; // cover above → pause next order (low perishability)
  perishableMinWeeks: number; // high perishability window
  perishableMaxWeeks: number;
  festivalUpliftPct: number; // demand uplift in festival months, applied before any threshold
  swingPct: number; // any week-on-week change bigger than this → exception for Raghav
  minHistoryWeeks: number; // fewer weeks of history → exception (new launch)
  maxDataAgeDays: number; // stock snapshot older than this → run blocked
};

export const DEFAULT_SETTINGS: Settings = {
  highDemandPct: 20,
  highDemandMultiplier: 1.5,
  stockoutWeeks: 6,
  overstockWeeks: 14,
  perishableMinWeeks: 3,
  perishableMaxWeeks: 4,
  festivalUpliftPct: 25,
  swingPct: 50,
  minHistoryWeeks: 12,
  maxDataAgeDays: 3,
};

export type Action = "REORDER_NOW" | "REORDER_UP" | "PAUSE" | "NO_ACTION" | "RAGHAV_DECIDES";

export type Metrics = {
  weeksOfHistory: number;
  lastWeek: string | null;
  avg12: number;
  avg4: number;
  trendPct: number; // (avg4 / avg12 − 1) × 100
  upliftPct: number; // 0 or festivalUpliftPct
  weeklyDemand: number; // avg12 × (1 + uplift)
  stock: number;
  weeksOfCover: number | null; // null = no sales in the window, so cover can't be computed
  maxSwingPct: number;
};

export type Recommendation = {
  skuId: string;
  skuName: string;
  perishability: Perishability;
  action: Action;
  qty: number; // units to order; 0 for PAUSE / NO_ACTION / RAGHAV_DECIDES
  rulesFired: string[];
  exceptions: string[]; // card 6: why Raghav must decide this one
  reason: string; // built from the numbers, by code
  metrics: Metrics;
};

export class ValidationError extends Error {
  constructor(public problems: string[]) {
    super(`Input data failed validation: ${problems.length} problem(s)`);
  }
}

// ---------- helpers ----------

const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** "2026-W27" → sortable number and its next week, for gap checks. ISO weeks; 52/53 handled. */
function parseWeek(w: string): { year: number; week: number } | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(w.trim());
  return m ? { year: +m[1], week: +m[2] } : null;
}
function isoWeeksInYear(year: number): number {
  // 53 weeks when 1 Jan is a Thursday, or a Wednesday in a leap year; otherwise 52.
  const jan1 = new Date(Date.UTC(year, 0, 1)).getUTCDay();
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return jan1 === 4 || (leap && jan1 === 3) ? 53 : 52;
}
function nextWeek(w: { year: number; week: number }) {
  return w.week >= isoWeeksInYear(w.year) ? { year: w.year + 1, week: 1 } : { year: w.year, week: w.week + 1 };
}
const weekKey = (w: { year: number; week: number }) => `${w.year}-W${String(w.week).padStart(2, "0")}`;

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso.slice(0, 10)) - Date.parse(fromIso.slice(0, 10))) / 864e5);
}

// ---------- card 3: validate ----------

export function validate(input: {
  skus: Sku[];
  sales: SalesRow[];
  stock: StockRow[];
  months: MonthRow[];
  runDate: string; // YYYY-MM-DD (IST)
  settings: Settings;
}): string[] {
  const { skus, sales, stock, months, runDate, settings } = input;
  const problems: string[] = [];
  const skuIds = new Set(skus.map((s) => s.id));

  if (skus.length === 0) problems.push("SKU master is empty.");
  for (const s of skus) {
    if (!s.id) problems.push("A SKU master row has no SKU_ID.");
    if (s.perishability !== "Low" && s.perishability !== "High") problems.push(`${s.id}: Perishability must be Low or High, got "${s.perishability}".`);
    if (!(s.stdQty > 0)) problems.push(`${s.id}: Standard_Reorder_Qty must be a positive number.`);
  }

  for (const r of sales) {
    if (!skuIds.has(r.skuId)) problems.push(`Sales row for unknown SKU ${r.skuId}.`);
    if (!parseWeek(r.week)) problems.push(`${r.skuId}: bad week "${r.week}" (expected 2026-W27).`);
    if (!Number.isFinite(r.units) || r.units < 0) problems.push(`${r.skuId} ${r.week}: units sold must be a number ≥ 0.`);
  }

  const stockBySku = new Map<string, StockRow[]>();
  for (const r of stock) stockBySku.set(r.skuId, [...(stockBySku.get(r.skuId) ?? []), r]);
  for (const s of skus) {
    const rows = stockBySku.get(s.id) ?? [];
    if (rows.length === 0) problems.push(`${s.id}: no stock-on-hand row.`);
    for (const r of rows) {
      if (!Number.isFinite(r.units) || r.units < 0) problems.push(`${s.id}: stock must be a number ≥ 0, got "${r.units}".`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.asOf)) problems.push(`${s.id}: bad As_Of_Date "${r.asOf}".`);
      else {
        const age = daysBetween(r.asOf, runDate);
        if (age < 0) problems.push(`${s.id}: stock date ${r.asOf} is after the run date ${runDate}.`);
        else if (age > settings.maxDataAgeDays)
          problems.push(`${s.id}: stock snapshot is ${age} days old (limit ${settings.maxDataAgeDays}). Upload a fresh SAP stock export.`);
      }
    }
  }
  for (const r of stock) if (!skuIds.has(r.skuId)) problems.push(`Stock row for unknown SKU ${r.skuId}.`);

  // Week gaps and duplicates, per SKU
  const weeksBySku = new Map<string, string[]>();
  for (const r of sales) weeksBySku.set(r.skuId, [...(weeksBySku.get(r.skuId) ?? []), r.week]);
  for (const [sku, weeks] of weeksBySku) {
    const sorted = [...weeks].sort();
    if (new Set(sorted).size !== sorted.length) problems.push(`${sku}: the same week appears twice.`);
    for (let i = 1; i < sorted.length; i++) {
      const a = parseWeek(sorted[i - 1]);
      const b = parseWeek(sorted[i]);
      if (a && b && weekKey(nextWeek(a)) !== weekKey(b)) problems.push(`${sku}: gap in weeks between ${sorted[i - 1]} and ${sorted[i]}.`);
    }
  }

  if (!months.some((m) => m.yearMonth === runDate.slice(0, 7)))
    problems.push(`Festival calendar has no row for ${runDate.slice(0, 7)}.`);

  // Dedupe while keeping order
  return [...new Set(problems)];
}

// ---------- card 4: compute ----------

export function computeMetrics(sku: Sku, sales: SalesRow[], stockUnits: number, festival: boolean, s: Settings): Metrics {
  const series = sales
    .filter((r) => r.skuId === sku.id)
    .sort((a, b) => a.week.localeCompare(b.week))
    .map((r) => r.units);
  const last12 = series.slice(-12);
  const last4 = series.slice(-4);
  const avg12 = last12.length ? mean(last12) : 0;
  const avg4 = last4.length ? mean(last4) : 0;
  const upliftPct = festival ? s.festivalUpliftPct : 0;
  const weeklyDemand = avg12 * (1 + upliftPct / 100);
  let maxSwingPct = 0;
  for (let i = Math.max(1, series.length - 12); i < series.length; i++) {
    const prev = series[i - 1];
    if (prev > 0) maxSwingPct = Math.max(maxSwingPct, (Math.abs(series[i] - prev) / prev) * 100);
  }
  const lastWeek = sales.filter((r) => r.skuId === sku.id).map((r) => r.week).sort().at(-1) ?? null;
  return {
    weeksOfHistory: series.length,
    lastWeek,
    avg12: round(avg12),
    avg4: round(avg4),
    trendPct: avg12 > 0 ? round((avg4 / avg12 - 1) * 100) : 0,
    upliftPct,
    weeklyDemand: round(weeklyDemand),
    stock: stockUnits,
    weeksOfCover: weeklyDemand > 0 ? round(stockUnits / weeklyDemand) : null,
    maxSwingPct: round(maxSwingPct),
  };
}

// ---------- cards 5 + 6: rules, then exceptions ----------

export function recommend(sku: Sku, m: Metrics, s: Settings): Recommendation {
  const rulesFired: string[] = [];
  const exceptions: string[] = [];
  const perishable = sku.perishability === "High";
  const minW = perishable ? s.perishableMinWeeks : s.stockoutWeeks;
  const maxW = perishable ? s.perishableMaxWeeks : s.overstockWeeks;

  // No sales at all: never a stockout; any stock on hand counts as overstock (nothing is selling it).
  const stockout = m.weeksOfCover !== null && m.weeksOfCover < minW;
  const overstock = m.weeksOfCover === null ? m.stock > 0 : m.weeksOfCover > maxW;
  const highDemand = m.avg12 > 0 && m.avg4 > m.avg12 * (1 + s.highDemandPct / 100);

  if (m.upliftPct > 0) rulesFired.push(`Festival month: demand +${m.upliftPct}%`);
  if (stockout) rulesFired.push(`${perishable ? "Perishable window" : "Stockout risk"}: cover ${m.weeksOfCover} wks < ${minW}`);
  if (overstock) rulesFired.push(`${perishable ? "Perishable window" : "Overstock risk"}: ${m.weeksOfCover === null ? "no sales" : `cover ${m.weeksOfCover} wks`} > ${maxW}`);
  if (highDemand) rulesFired.push(`High demand: last 4 wks +${m.trendPct}% vs 12-wk avg (> ${s.highDemandPct}%)`);

  // Card 6: cases the written rules don't cover; Raghav decides these himself.
  if (m.weeksOfHistory < s.minHistoryWeeks) exceptions.push(`Only ${m.weeksOfHistory} weeks of history (new launch?)`);
  if (m.maxSwingPct > s.swingPct) exceptions.push(`A week-on-week swing of ${m.maxSwingPct}% (> ${s.swingPct}%)`);
  if (highDemand && overstock) exceptions.push("Conflicting flags: demand is up but stock is above the maximum");

  const up = Math.round(sku.stdQty * s.highDemandMultiplier);
  let action: Action;
  let qty = 0;
  if (exceptions.length) action = "RAGHAV_DECIDES";
  else if (stockout) {
    action = "REORDER_NOW";
    qty = highDemand ? up : sku.stdQty;
  } else if (overstock) action = "PAUSE";
  else if (highDemand) {
    action = "REORDER_UP";
    qty = up;
  } else action = "NO_ACTION";

  const cover =
    m.weeksOfCover === null
      ? `${m.stock} in stock, no sales in the last ${Math.min(12, m.weeksOfHistory) || 0} weeks`
      : `${m.stock} in stock ÷ ${m.weeklyDemand}/wk${m.upliftPct ? ` (incl. +${m.upliftPct}% festival)` : ""} = ${m.weeksOfCover} wks of cover`;
  const reasonByAction: Record<Action, string> = {
    REORDER_NOW: `${cover}, below the ${minW}-week minimum. Reorder ${qty}${highDemand ? ` (1.5× standard ${sku.stdQty}, demand up ${m.trendPct}%)` : ` (standard qty)`}.`,
    REORDER_UP: `Demand up ${m.trendPct}% vs the 12-week average. ${cover}. Next order at ${qty} (1.5× standard ${sku.stdQty}).`,
    PAUSE: `${cover}, above the ${maxW}-week maximum${perishable ? " for a perishable" : ""}. Pause the next order.`,
    NO_ACTION: `${cover}, inside the ${minW}–${maxW} week band. No change.`,
    RAGHAV_DECIDES: `Outside the written rules: ${exceptions.join("; ")}. ${cover}. Raghav decides.`,
  };

  return { skuId: sku.id, skuName: sku.name, perishability: sku.perishability, action, qty, rulesFired, exceptions, reason: reasonByAction[action], metrics: m };
}

/** The whole engine for one run. Throws ValidationError if card 3 finds anything wrong (never guesses). */
export function runEngine(input: {
  skus: Sku[];
  sales: SalesRow[];
  stock: StockRow[];
  months: MonthRow[];
  runDate: string;
  settings: Settings;
}): { festival: boolean; recommendations: Recommendation[] } {
  const problems = validate(input);
  if (problems.length) throw new ValidationError(problems);
  const festival = input.months.find((m) => m.yearMonth === input.runDate.slice(0, 7))?.festival ?? false;
  const recommendations = input.skus
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((sku) => {
      const units = input.stock.filter((r) => r.skuId === sku.id).reduce((a, r) => a + r.units, 0);
      return recommend(sku, computeMetrics(sku, input.sales, units, festival, input.settings), input.settings);
    });
  return { festival, recommendations };
}

export const ACTION_LABEL: Record<Action, string> = {
  REORDER_NOW: "Reorder now",
  REORDER_UP: "Reorder 1.5×",
  PAUSE: "Pause next order",
  NO_ACTION: "No action",
  RAGHAV_DECIDES: "Raghav decides",
};
