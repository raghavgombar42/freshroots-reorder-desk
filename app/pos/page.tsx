import { db, withDb } from "@/lib/db";
import { isOperator } from "@/lib/auth";
import { zohoConfigured, zohoPoUrl } from "@/lib/zoho";
import { pushToZoho } from "../actions";
import { Card, Flash, NoDb, Tag, ist, type SP } from "../ui";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export default async function Pos({ searchParams }: { searchParams: SP }) {
  let lines, zpos;
  try {
    [lines, zpos] = await withDb(() =>
      Promise.all([
        db()`select p.*, s.name, d.name as vendor_name, u.started_at, dc.decision
          from po_lines p join skus s on s.id = p.sku_id left join distributors d on d.id = p.vendor_id
          join runs u on u.id = p.run_id join decisions dc on dc.recommendation_id = p.recommendation_id
          order by p.run_id desc, p.vendor_id, p.sku_id`,
        db()`select run_id, vendor_id, zoho_po_id, zoho_po_number from zoho_pos`,
      ]),
    );
  } catch (e) {
    return <NoDb error={e} />;
  }
  const operator = await isOperator();
  const live = zohoConfigured();
  const zohoBy = new Map(zpos.map((z) => [`${z.run_id}:${z.vendor_id}`, z]));
  const byRun = new Map<number, typeof lines>();
  for (const l of lines) byRun.set(Number(l.run_id), [...(byRun.get(Number(l.run_id)) ?? []), l] as typeof lines);

  return (
    <div className="space-y-5">
      <Flash searchParams={searchParams} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Draft POs (cards 10 → 12)</h1>
        <p className="text-sm text-muted">
          Only lines Raghav approved or edited, one per SKU per run. They go to Zoho Inventory as <b>draft</b> purchase orders, one per distributor. The desk
          never issues an order: procurement opens the draft in Zoho, adds prices and places it, as today.{" "}
          {live ? <Tag tone="data">Zoho Inventory connected</Tag> : <Tag tone="human">Zoho not connected: CSV export only</Tag>}
        </p>
      </div>
      {byRun.size === 0 && (
        <Card>
          <p className="text-sm text-muted">No approved reorders yet.</p>
        </Card>
      )}
      {[...byRun].map(([runId, ls]) => {
        const vendors = [...new Set(ls.map((l) => l.vendor_id as string))];
        const pending = vendors.filter((v) => !zohoBy.get(`${runId}:${v}`)?.zoho_po_id).length;
        return (
          <Card
            key={runId}
            title={`Run #${runId} · ${ist(ls[0].started_at)}`}
            right={
              <div className="flex flex-wrap items-center gap-2">
                {live && operator && pending > 0 && (
                  <form action={pushToZoho}>
                    <input type="hidden" name="runId" value={runId} />
                    <button className="rounded-md bg-data px-3 py-1 text-sm font-semibold text-white hover:opacity-90">
                      Send {pending} draft PO{pending > 1 ? "s" : ""} to Zoho
                    </button>
                  </form>
                )}
                {live && pending === 0 && <Tag tone="data">All in Zoho</Tag>}
                <a href={`/api/po-csv?run=${runId}`} className="rounded-md border border-data px-3 py-1 text-sm font-semibold text-data hover:bg-data-soft">
                  Download Zoho CSV
                </a>
              </div>
            }
          >
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted">
                <tr>
                  <th className="py-1 pr-3">SKU</th>
                  <th className="py-1 pr-3">Vendor (per SKU master)</th>
                  <th className="py-1 pr-3">Qty</th>
                  <th className="py-1 pr-3">Decision</th>
                  <th className="py-1">Zoho draft PO</th>
                </tr>
              </thead>
              <tbody>
                {ls.map((l) => {
                  const z = zohoBy.get(`${runId}:${l.vendor_id}`);
                  return (
                    <tr key={l.id} className="border-t border-line">
                      <td className="py-1.5 pr-3">
                        <b>{l.sku_id}</b> {String(l.name).replace("Freshroots ", "")}
                      </td>
                      <td className="py-1.5 pr-3">
                        {l.vendor_id} {l.vendor_name && <span className="text-muted">· {l.vendor_name}</span>}
                      </td>
                      <td className="py-1.5 pr-3 font-semibold tabular-nums">{l.qty}</td>
                      <td className="py-1.5 pr-3">
                        <Tag tone={l.decision === "edited" ? "human" : "data"}>{l.decision}</Tag>
                      </td>
                      <td className="py-1.5">
                        {z?.zoho_po_id ? (
                          <a href={zohoPoUrl(z.zoho_po_id)} target="_blank" className="text-data underline">
                            {z.zoho_po_number}
                          </a>
                        ) : (
                          <span className="text-muted">not sent</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        );
      })}
    </div>
  );
}
