import { db, withDb } from "@/lib/db";
import { isOperator } from "@/lib/auth";
import { zohoConfigured, zohoPoUrl } from "@/lib/zoho";
import { pushToZoho } from "../actions";
import { SubmitButton } from "../buttons";
import { Icon } from "../icons";
import { Card, EmptyState, Flash, NoDb, Notice, PageHeader, Table, Tag, ist, type SP } from "../ui";

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
    <div className="space-y-6">
      <Flash searchParams={searchParams} />

      <PageHeader
        eyebrow={
          <>
            <span className="rounded-full bg-rail px-2 py-0.5 text-[11px] font-semibold text-white">Step 2 of 3</span>
            <span>Approved lines → Zoho Inventory · cards 10 → 12</span>
          </>
        }
        title="Draft POs"
        description={
          <>
            Only lines Raghav approved or edited appear here, one per SKU per run. They go to Zoho Inventory as <b className="font-semibold text-ink">draft</b>{" "}
            purchase orders, one per distributor. <b className="font-semibold text-ink">The desk never issues an order</b>: procurement opens the draft in
            Zoho, adds prices and places it, as today.
          </>
        }
        actions={
          live ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-data-soft px-3 py-1 text-xs font-semibold text-data ring-1 ring-inset ring-data/25">
              <span className="h-1.5 w-1.5 rounded-full bg-data" aria-hidden="true" /> Zoho Inventory connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-human-soft px-3 py-1 text-xs font-semibold text-human ring-1 ring-inset ring-human/25">
              <span className="h-1.5 w-1.5 rounded-full bg-human" aria-hidden="true" /> Zoho not connected: CSV export only
            </span>
          )
        }
      />

      <Notice tone="info" title="Pilot setup">
        Drafts go to a pilot Zoho Inventory organisation, &ldquo;Freshroots (Pilot)&rdquo;. Prices are ₹0 because the case data has no prices; procurement
        fills them in before issuing. A run can be sent only once per distributor, so a double click never creates a duplicate PO. The CSV download is a
        fallback in Zoho&apos;s import format.
      </Notice>

      {byRun.size === 0 && (
        <EmptyState icon="file" title="No approved reorders yet">
          Approve or edit a reorder on the Recommendations page and it appears here as a draft PO line.
        </EmptyState>
      )}

      {[...byRun].map(([runId, ls]) => {
        const vendors = [...new Set(ls.map((l) => l.vendor_id as string))];
        const pending = vendors.filter((v) => !zohoBy.get(`${runId}:${v}`)?.zoho_po_id).length;
        const units = ls.reduce((a, l) => a + Number(l.qty), 0);
        return (
          <Card
            key={runId}
            icon="file"
            title={`Run #${runId}`}
            subtitle={`${ist(ls[0].started_at)} · ${ls.length} line${ls.length > 1 ? "s" : ""} · ${vendors.length} distributor${vendors.length > 1 ? "s" : ""} · ${units.toLocaleString("en-IN")} units`}
            right={
              <div className="flex flex-wrap items-center gap-2">
                {live && operator && pending > 0 && (
                  <form action={pushToZoho}>
                    <input type="hidden" name="runId" value={runId} />
                    <SubmitButton variant="approve" icon="send" pendingText="Sending to Zoho…">
                      Send {pending} draft PO{pending > 1 ? "s" : ""} to Zoho
                    </SubmitButton>
                  </form>
                )}
                {live && pending > 0 && !operator && <Tag tone="human">{pending} not sent yet</Tag>}
                {live && pending === 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-data">
                    <Icon name="check" className="h-3.5 w-3.5" /> All in Zoho
                  </span>
                )}
                <a
                  href={`/api/po-csv?run=${runId}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-[13px] font-semibold text-ink transition-colors hover:bg-paper"
                >
                  <Icon name="download" className="h-3.5 w-3.5" />
                  CSV
                </a>
              </div>
            }
          >
            <Table head={["SKU", "Distributor (vendor)", "Quantity", "Decision", "Zoho draft PO"]} minWidth={640}>
              {ls.map((l) => {
                const z = zohoBy.get(`${runId}:${l.vendor_id}`);
                return (
                  <tr key={l.id}>
                    <td>
                      <span className="font-semibold">{String(l.name).replace("Freshroots ", "")}</span>
                      <span className="ml-1.5 font-mono text-[11px] text-muted">{l.sku_id}</span>
                    </td>
                    <td>
                      {l.vendor_name ?? l.vendor_id} <span className="font-mono text-[11px] text-muted">{l.vendor_id}</span>
                    </td>
                    <td className="font-semibold tabular-nums">{Number(l.qty).toLocaleString("en-IN")}</td>
                    <td>
                      <Tag tone={l.decision === "edited" ? "human" : "data"}>{l.decision === "edited" ? "Edited by Raghav" : "Approved by Raghav"}</Tag>
                    </td>
                    <td>
                      {z?.zoho_po_id ? (
                        <a href={zohoPoUrl(z.zoho_po_id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-data hover:underline">
                          {z.zoho_po_number} <span className="font-normal text-muted">· draft</span>
                          <Icon name="external" className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-muted">Not sent</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </Table>
          </Card>
        );
      })}
    </div>
  );
}
