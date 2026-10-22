import { db, withDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Card 12 (pilot): approved PO lines as a CSV in the shape of a Zoho Inventory purchase-order import. */
export async function GET(req: Request) {
  const runId = Number(new URL(req.url).searchParams.get("run"));
  if (!Number.isInteger(runId) || runId <= 0) return new Response("run must be a run id", { status: 400 });
  const lines = await withDb(() => db()`select p.sku_id, p.qty, p.vendor_id, s.name, d.name as vendor_name, u.run_date
    from po_lines p join skus s on s.id = p.sku_id left join distributors d on d.id = p.vendor_id join runs u on u.id = p.run_id
    where p.run_id = ${runId} order by p.vendor_id, p.sku_id`);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [
    ["Purchase Order Date", "Purchase Order Number", "Vendor Name", "Item Name", "SKU", "Quantity", "Status"],
    ...lines.map((l) => [l.run_date, `RD-${runId}-${l.vendor_id}`, l.vendor_name ?? l.vendor_id, l.name, l.sku_id, l.qty, "Draft"]),
  ];
  return new Response(rows.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="freshroots-draft-po-run-${runId}.csv"` },
  });
}
