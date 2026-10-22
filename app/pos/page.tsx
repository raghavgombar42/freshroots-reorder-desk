import { db, withDb } from "@/lib/db";
import { Card, Flash, NoDb, Tag, ist, type SP } from "../ui";

export const dynamic = "force-dynamic";

export default async function Pos({ searchParams }: { searchParams: SP }) {
  let lines;
  try {
    lines = await withDb(() => db()`select p.*, s.name, d.name as vendor_name, u.started_at, dc.decision
      from po_lines p join skus s on s.id = p.sku_id left join distributors d on d.id = p.vendor_id
      join runs u on u.id = p.run_id join decisions dc on dc.recommendation_id = p.recommendation_id
      order by p.run_id desc, p.sku_id`);
  } catch (e) {
    return <NoDb error={e} />;
  }
  const byRun = new Map<number, typeof lines>();
  for (const l of lines) byRun.set(Number(l.run_id), [...(byRun.get(Number(l.run_id)) ?? []), l] as typeof lines);

  return (
    <div className="space-y-5">
      <Flash searchParams={searchParams} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Draft POs (cards 10 → 12)</h1>
        <p className="text-sm text-muted">
          Only lines Raghav approved or edited, one per SKU per run. The desk never places an order: procurement imports the CSV into Zoho Inventory and
          places it as today. <Tag tone="human">pilot: Zoho-format CSV, no live Zoho API yet</Tag>
        </p>
      </div>
      {byRun.size === 0 && (
        <Card>
          <p className="text-sm text-muted">No approved reorders yet.</p>
        </Card>
      )}
      {[...byRun].map(([runId, ls]) => (
        <Card
          key={runId}
          title={`Run #${runId} · ${ist(ls[0].started_at)}`}
          right={
            <a href={`/api/po-csv?run=${runId}`} className="rounded-md border border-data px-3 py-1 text-sm font-semibold text-data hover:bg-data-soft">
              Download Zoho CSV
            </a>
          }
        >
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted">
              <tr>
                <th className="py-1 pr-3">SKU</th>
                <th className="py-1 pr-3">Vendor (per SKU master)</th>
                <th className="py-1 pr-3">Qty</th>
                <th className="py-1">Decision</th>
              </tr>
            </thead>
            <tbody>
              {ls.map((l) => (
                <tr key={l.id} className="border-t border-line">
                  <td className="py-1.5 pr-3">
                    <b>{l.sku_id}</b> {String(l.name).replace("Freshroots ", "")}
                  </td>
                  <td className="py-1.5 pr-3">
                    {l.vendor_id} {l.vendor_name && <span className="text-muted">· {l.vendor_name}</span>}
                  </td>
                  <td className="py-1.5 pr-3 font-semibold tabular-nums">{l.qty}</td>
                  <td className="py-1.5">
                    <Tag tone={l.decision === "edited" ? "human" : "data"}>{l.decision}</Tag>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  );
}
