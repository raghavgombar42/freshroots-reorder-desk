import { z } from "zod";
import { db } from "./db";
import { DEFAULT_SETTINGS, type Settings } from "./engine";

/** Card R: what Raghav may set, and the sane range for each number. A bad edit is refused, not stored. */
export const SETTINGS_SCHEMA = z
  .object({
    highDemandPct: z.number().min(1).max(200),
    highDemandMultiplier: z.number().min(1).max(5),
    stockoutWeeks: z.number().min(0.5).max(26),
    overstockWeeks: z.number().min(1).max(52),
    perishableMinWeeks: z.number().min(0.5).max(12),
    perishableMaxWeeks: z.number().min(1).max(12),
    festivalUpliftPct: z.number().min(0).max(200),
    swingPct: z.number().min(5).max(500),
    minHistoryWeeks: z.number().int().min(1).max(52),
    maxDataAgeDays: z.number().int().min(0).max(60),
  })
  .refine((s) => s.stockoutWeeks < s.overstockWeeks, "Stockout weeks must be below overstock weeks")
  .refine((s) => s.perishableMinWeeks < s.perishableMaxWeeks, "Perishable minimum must be below the maximum");

export const SETTING_LABELS: Record<keyof Settings, string> = {
  highDemandPct: "High-demand trigger: 4-wk avg above 12-wk avg by more than (%)",
  highDemandMultiplier: "High-demand order size (× standard qty)",
  stockoutWeeks: "Stockout risk below (weeks of cover)",
  overstockWeeks: "Overstock risk above (weeks of cover)",
  perishableMinWeeks: "Perishable minimum (weeks)",
  perishableMaxWeeks: "Perishable maximum (weeks)",
  festivalUpliftPct: "Festival-month demand uplift (%)",
  swingPct: "Exception: week-on-week swing above (%)",
  minHistoryWeeks: "Exception: fewer weeks of history than",
  maxDataAgeDays: "Block run if stock snapshot older than (days)",
};

export async function currentSettings(): Promise<{ version: number; settings: Settings; createdAt: string; note: string | null }> {
  const [row] = await db()`select version, settings, created_at, note from rule_settings order by version desc limit 1`;
  if (!row) {
    const [ins] = await db()`insert into rule_settings (settings, note) values (${db().json(DEFAULT_SETTINGS)}, 'Raghav''s documented rules (case brief)') returning version, created_at`;
    return { version: Number(ins.version), settings: DEFAULT_SETTINGS, createdAt: String(ins.created_at), note: "Raghav's documented rules (case brief)" };
  }
  return { version: Number(row.version), settings: { ...DEFAULT_SETTINGS, ...(row.settings as Settings) }, createdAt: String(row.created_at), note: row.note };
}
