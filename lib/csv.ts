import type { MonthRow, SalesRow, Sku, StockRow } from "./engine";

/** Card 2: the SAP export files. Minimal CSV parsing (SAP exports here have no quoted commas). */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];
  const head = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    return Object.fromEntries(head.map((h, i) => [h, cells[i] ?? ""]));
  });
}

export const FILE_KINDS = {
  sku_master: ["SKU_ID", "SKU_Name", "Category", "Perishability", "Standard_Reorder_Qty", "Unit_of_Measure", "Distributor_ID"],
  weekly_sales: ["SKU_ID", "Week", "Units_Sold"],
  current_inventory: ["SKU_ID", "Location", "Units_On_Hand", "As_Of_Date"],
  distributor_master: ["Distributor_ID", "Distributor_Name", "Region", "Status"],
  calendar: ["Year", "Month", "Year_Month", "Is_Festival_Month"],
} as const;
export type FileKind = keyof typeof FILE_KINDS;

/** Work out which SAP file this is from its header row; null if it matches none. */
export function detectKind(text: string): FileKind | null {
  const head = (text.replace(/^﻿/, "").split(/\r?\n/)[0] ?? "").split(",").map((h) => h.trim());
  for (const [kind, cols] of Object.entries(FILE_KINDS)) if (cols.every((c) => head.includes(c))) return kind as FileKind;
  return null;
}

const num = (v: string) => (v === "" ? NaN : Number(v));

export const toSkus = (rows: Record<string, string>[]): Sku[] =>
  rows.map((r) => ({
    id: r.SKU_ID,
    name: r.SKU_Name,
    category: r.Category,
    perishability: r.Perishability as Sku["perishability"],
    stdQty: num(r.Standard_Reorder_Qty),
    distributorId: r.Distributor_ID,
  }));
export const toSales = (rows: Record<string, string>[]): SalesRow[] =>
  rows.map((r) => ({ skuId: r.SKU_ID, week: r.Week, units: num(r.Units_Sold) }));
export const toStock = (rows: Record<string, string>[]): StockRow[] =>
  rows.map((r) => ({ skuId: r.SKU_ID, location: r.Location, units: num(r.Units_On_Hand), asOf: r.As_Of_Date }));
export const toMonths = (rows: Record<string, string>[]): MonthRow[] =>
  rows.map((r) => ({ yearMonth: r.Year_Month, festival: r.Is_Festival_Month.toUpperCase() === "TRUE" }));
