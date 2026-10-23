import { db, withDb } from "@/lib/db";
import { isOperator } from "@/lib/auth";
import { zohoConfigured, zohoPoUrl } from "@/lib/zoho";
import { pushToZoho } from "../actions";
import { SubmitButton } from "../buttons";
import { Icon } from "../icons";
import { buttonClass } from "../styles";
import { Card, EmptyState, Flash, NoDb, Notice, PageHeader, Step, Table, Tag, ist, type SP } from "../ui";

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
            <Step n={2} />
            <span>Approved lines → Zoho Inventory</span>
          </>
        }
        title="Draft POs"
        description={
          <>
            Lines Raghav approved or edited, one per SKU per run, sent to Zoho Inventory as <span className="text-ink">draft</span> purchase orders, one
            per distributor. <span className="text-ink">The desk never issues an order</span>: procurement adds prices and places it in Zoho.
          </>
        }
        actions={
          <span
            className={`inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-medium ${
              live ? "border-rail/20 bg-rail-soft text-rail" : "border-human/25 bg-human-soft text-human"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-rail" : "bg-human"}`} aria-hidden="true" />
            {live ? "Zoho Inventory connected" : "Zoho not connected · CSV export only"}
          </span>
        }
      />

      <Notice title="Pilot setup.">
        Drafts go to a pilot Zoho Inventory organisation, &ldquo;Freshroots (Pilot)&rdquo;, at ₹0 because the case data has no prices; procurement fills
        them in before issuing. A run can be sent only once per distributor, so a double click never creates a duplicate. The CSV is a fallback in
        Zoho&apos;s import format.
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
            flush
            title={
              <span className="flex items-center gap-2">
                Run #{runId}
                {live && pending === 0 && (
                  <Tag tone="data">
                    <Icon name="check" className="h-3 w-3" /> All in Zoho
                  </Tag>
                )}
                {live && pending > 0 && <Tag tone="human">{pending} not sent</Tag>}
              </span>
            }
            subtitle={
              <span className="num">
                {ist(ls[0].started_at)} · {ls.length} line{ls.length > 1 ? "s" : ""} · {vendors.length} distributor{vendors.length > 1 ? "s" : ""} ·{" "}
                {units.toLocaleString("en-IN")} units
              </span>
            }
            right={
              <div className="flex flex-wrap items-center gap-2">
                <a href={`/api/po-csv?run=${runId}`} className={buttonClass("secondary")}>
                  <Icon name="download" className="h-3.5 w-3.5" />
                  CSV
                </a>
                {live && operator && pending > 0 && (
                  <form action={pushToZoho}>
                    <input type="hidden" name="runId" value={runId} />
                    <SubmitButton variant="primary" icon="send" pendingText="Sending to Zoho…">
                      Send {pending} draft PO{pending > 1 ? "s" : ""} to Zoho
                    </SubmitButton>
                  </form>
                )}
              </div>
            }
          >
            <Table
              head={[
                { label: "SKU", width: "28%" },
                "Distributor (vendor)",
                { label: "Quantity", align: "right" },
                "Decision",
                "Zoho draft PO",
              ]}
              minWidth={700}
            >
              {ls.map((l) => {
                const z = zohoBy.get(`${runId}:${l.vendor_id}`);
                return (
                  <tr key={l.id}>
                    <td>
                      <span className="font-medium">{String(l.name).replace("Freshroots ", "")}</span>
                      <span className="ml-2 font-mono text-[11.5px] text-faint">{l.sku_id}</span>
                    </td>
                    <td>
                      {l.vendor_name ?? l.vendor_id} <span className="ml-1 font-mono text-[11.5px] text-faint">{l.vendor_id}</span>
                    </td>
                    <td className="num text-right font-semibold">{Number(l.qty).toLocaleString("en-IN")}</td>
                    <td>
                      <Tag tone={l.decision === "edited" ? "human" : "data"}>{l.decision === "edited" ? "Edited by Raghav" : "Approved by Raghav"}</Tag>
                    </td>
                    <td>
                      {z?.zoho_po_id ? (
                        <a
                          href={zohoPoUrl(z.zoho_po_id)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-rail underline-offset-2 hover:underline"
                        >
                          {z.zoho_po_number}
                          <span className="font-normal text-muted">· draft</span>
                          <Icon name="external" className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-faint">Not sent</span>
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
