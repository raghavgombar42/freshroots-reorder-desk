import { db, withDb } from "@/lib/db";
import { isOperator } from "@/lib/auth";
import { SETTING_LABELS, currentSettings } from "@/lib/settings";
import type { Settings } from "@/lib/engine";
import { saveRules } from "../actions";
import { SubmitButton } from "../buttons";
import { Icon } from "../icons";
import { Card, Flash, NoDb, PageHeader, SourceTag, Table, Tag, ist, type SP } from "../ui";

export const dynamic = "force-dynamic";

// Presentation only: how the existing settings are grouped on screen. Every key is still in the form.
const GROUPS: { title: string; note: string; keys: (keyof Settings)[] }[] = [
  { title: "Stock bands", note: "Low-perishability SKUs: reorder below the minimum, pause above the maximum.", keys: ["stockoutWeeks", "overstockWeeks"] },
  { title: "Perishables", note: "Tighter window for high-perishability SKUs, checked first.", keys: ["perishableMinWeeks", "perishableMaxWeeks"] },
  { title: "Demand signals", note: "Festival uplift is applied before any threshold check.", keys: ["highDemandPct", "highDemandMultiplier", "festivalUpliftPct"] },
  { title: "Exceptions → Raghav decides", note: "Cases the written rules don't cover go to Raghav with no automatic quantity.", keys: ["swingPct", "minHistoryWeeks"] },
  { title: "Data checks", note: "Leave blank for no freshness limit on the SAP stock export.", keys: ["maxDataAgeDays"] },
];

const ORDER = ["Validate data", "Festival uplift", "Perishable window", "Stockout", "Overstock", "High demand (1.5×)", "Exceptions → Raghav"];

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
  const grouped = new Set(GROUPS.flatMap((g) => g.keys));
  const extra = keys.filter((k) => !grouped.has(k)); // safety net: any setting not in a group is still shown

  return (
    <div className="space-y-6">
      <Flash searchParams={searchParams} />

      <PageHeader
        eyebrow={
          <>
            <span>Setup · owned by</span>
            <SourceTag kind="human" />
          </>
        }
        title="Rules"
        description={
          <>
            Raghav&apos;s documented rules as numbers he owns. They live here, <span className="text-ink">not in an AI prompt</span>, so every decision
            is predictable and testable. Each save is a new version; every run records the version it used.
          </>
        }
        actions={
          <span className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-line bg-board px-2.5 text-[12.5px] font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-rail" aria-hidden="true" />
            Live: v{cur.version} <span className="font-normal text-muted">· {ist(cur.createdAt)}</span>
          </span>
        }
      />

      <div className="rounded-xl border border-line bg-board px-4 py-3">
        <div className="mb-2 flex items-center gap-2 text-[12.5px] text-muted">
          <SourceTag kind="code" /> Order the engine applies them · fixed in code; only the numbers below are editable
        </div>
        <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-[13px]">
          {ORDER.map((s, i) => (
            <li key={s} className="flex items-center gap-1.5">
              <span className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-line bg-sunk/60 px-2.5 font-medium">
                <span className="num text-faint">{i + 1}</span>
                {s}
              </span>
              {i < ORDER.length - 1 && <Icon name="arrowRight" className="h-3.5 w-3.5 text-faint" />}
            </li>
          ))}
        </ol>
      </div>

      <form action={saveRules} className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          {[...GROUPS, ...(extra.length ? [{ title: "Other", note: "", keys: extra }] : [])].map((g) => (
            <Card key={g.title} title={g.title} subtitle={g.note}>
              <div className="divide-y divide-line rounded-lg border border-line">
                {g.keys.map((k) => (
                  <label key={k} className="flex items-center justify-between gap-4 px-3 py-2 text-[13.5px] transition-colors hover:bg-sunk/40">
                    <span className="text-ink/90">{SETTING_LABELS[k]}</span>
                    <input
                      name={k}
                      type="number"
                      step="any"
                      defaultValue={cur.settings[k] ?? ""}
                      placeholder={k === "maxDataAgeDays" ? "no limit" : undefined}
                      disabled={!operator}
                      className="field num h-8 w-24 text-right font-semibold disabled:cursor-not-allowed disabled:border-transparent disabled:bg-transparent disabled:text-ink"
                    />
                  </label>
                ))}
              </div>
            </Card>
          ))}
        </div>
        {operator ? (
          <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-board/95 p-2.5 shadow-[0_8px_24px_rgba(28,28,24,0.10)] backdrop-blur">
            <input name="note" placeholder="Why the change? (e.g. Diwali came early)" className="field min-w-56 flex-1" aria-label="Reason for the change" />
            <SubmitButton variant="primary" size="md" icon="check" pendingText="Saving…">
              Save as new version
            </SubmitButton>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-[13px] text-muted">
            <Icon name="lock" className="h-3.5 w-3.5" /> View only. Unlock the desk to edit the rules.
          </p>
        )}
      </form>

      <Card flush title="Version history" subtitle="Older versions are never changed; each run stores the version it used.">
        <Table head={[{ label: "Version", width: "120px" }, { label: "Saved", width: "180px" }, "Note"]} minWidth={520}>
          {history.map((h, i) => (
            <tr key={h.version}>
              <td className="whitespace-nowrap font-semibold">
                <span className="num">v{h.version}</span> {i === 0 && <Tag tone="data">Live</Tag>}
              </td>
              <td className="num whitespace-nowrap text-muted">{ist(h.created_at)}</td>
              <td className="text-muted">{h.note}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
