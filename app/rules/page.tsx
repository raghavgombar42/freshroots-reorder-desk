import { db, withDb } from "@/lib/db";
import { isOperator } from "@/lib/auth";
import { SETTING_LABELS, currentSettings } from "@/lib/settings";
import type { Settings } from "@/lib/engine";
import { saveRules } from "../actions";
import { Card, Flash, NoDb, Tag, ist, type SP } from "../ui";

export const dynamic = "force-dynamic";

export default async function Rules({ searchParams }: { searchParams: SP }) {
  let cur, history;
  try {
    [cur, history] = await withDb(() =>
      Promise.all([currentSettings(), db()`select version, settings, note, created_at from rule_settings order by version desc limit 20`]),
    );
  } catch (e) {
    return <NoDb error={e} />;
  }
  const operator = await isOperator();
  const keys = Object.keys(SETTING_LABELS) as (keyof Settings)[];

  return (
    <div className="space-y-5">
      <Flash searchParams={searchParams} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Rule settings (card R)</h1>
        <p className="text-sm text-muted">
          Raghav&apos;s documented rules as numbers he owns. The engine applies them in a fixed order: perishable window → stockout → overstock → high
          demand. They live here, not in an AI prompt. Every save is a new version and every run records the version it used.
        </p>
      </div>

      <Card title={<span>Live: version {cur.version} <Tag>{ist(cur.createdAt)}</Tag></span>} tone="human">
        <form action={saveRules} className="grid gap-3 sm:grid-cols-2">
          {keys.map((k) => (
            <label key={k} className="flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2 text-sm">
              <span>{SETTING_LABELS[k]}</span>
              <input
                name={k}
                type="number"
                step="any"
                defaultValue={cur.settings[k] ?? ""}
                placeholder={k === "maxDataAgeDays" ? "no limit" : undefined}
                disabled={!operator}
                className="w-24 rounded-md border border-line px-2 py-1 text-right tabular-nums disabled:bg-paper"
              />
            </label>
          ))}
          {operator ? (
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <input name="note" placeholder="Why the change? (e.g. Diwali came early)" className="flex-1 rounded-md border border-line px-2 py-1.5 text-sm" />
              <button className="rounded-md bg-human px-4 py-1.5 text-sm font-semibold text-white">Save as new version</button>
            </div>
          ) : (
            <p className="text-xs text-muted sm:col-span-2">Unlock to edit.</p>
          )}
        </form>
      </Card>

      <Card title="Version history">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted">
            <tr>
              <th className="py-1 pr-3">Version</th>
              <th className="py-1 pr-3">Saved</th>
              <th className="py-1">Note</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.version} className="border-t border-line">
                <td className="py-1.5 pr-3">v{h.version}</td>
                <td className="py-1.5 pr-3 whitespace-nowrap">{ist(h.created_at)}</td>
                <td className="py-1.5 text-muted">{h.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
