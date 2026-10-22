import { db, withDb } from "@/lib/db";
import { isOperator } from "@/lib/auth";
import { simulateStockRefresh, uploadCsv } from "../actions";
import { Card, Flash, NoDb, Tag, ist, type SP } from "../ui";

export const dynamic = "force-dynamic";

export default async function Upload({ searchParams }: { searchParams: SP }) {
  let d;
  try {
    d = await withDb(async () => {
    const sql = db();
    const [counts] = await sql`select (select count(*) from skus)::int as skus, (select count(*) from weekly_sales)::int as sales,
      (select min(week) from weekly_sales) as first_week, (select max(week) from weekly_sales) as last_week,
      (select max(as_of) from stock_snapshots) as stock_as_of, (select count(*) from distributors)::int as distributors,
      (select count(*) from calendar_months)::int as months`;
    const uploads = await sql`select * from uploads order by id desc limit 15`;
    return { counts, uploads };
    });
  } catch (e) {
    return <NoDb error={e} />;
  }
  const operator = await isOperator();
  const c = d.counts;

  return (
    <div className="space-y-5">
      <Flash searchParams={searchParams} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">SAP data (card 2)</h1>
        <p className="text-sm text-muted">
          In production IT drops the SAP export twice a week. In this pilot the files are uploaded here. Every run re-checks them first (card 3): missing
          SKUs, negative stock, gaps in weeks or a stock snapshot older than the limit stop the run.
        </p>
      </div>

      <Card title="What's loaded">
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          <li>SKUs: <b>{c.skus}</b> <span className="text-muted">(pilot sample of Freshroots&apos; 400)</span></li>
          <li>Distributors: <b>{c.distributors}</b></li>
          <li>Weekly sales rows: <b>{c.sales}</b> <span className="text-muted">({c.first_week} → {c.last_week})</span></li>
          <li>Latest stock snapshot: <b>{c.stock_as_of ?? "—"}</b></li>
          <li>Festival calendar months: <b>{c.months}</b></li>
        </ul>
      </Card>

      {operator && (
        <Card title="Upload SAP export CSVs" tone="data">
          <form action={uploadCsv} className="flex flex-wrap items-center gap-3 text-sm">
            <input type="file" name="files" accept=".csv,text/csv" multiple className="text-sm" />
            <button className="rounded-md bg-data px-3 py-1.5 font-semibold text-white">Upload</button>
          </form>
          <p className="mt-2 text-xs text-muted">
            Recognised by header: sku_master, weekly_sales, current_inventory, distributor_master, calendar. Re-uploading the same rows changes nothing.
          </p>
          <form action={simulateStockRefresh} className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm">
            <Tag tone="human">pilot only</Tag>
            <span>No live SAP link yet. Copy the latest stock snapshot to today&apos;s date (simulated refresh), so a demo run passes the freshness check.</span>
            <button className="rounded-md border border-human px-3 py-1.5 font-semibold text-human">Simulate SAP stock refresh</button>
          </form>
        </Card>
      )}

      <Card title="Upload history">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted">
            <tr>
              <th className="py-1 pr-3">When</th>
              <th className="py-1 pr-3">File</th>
              <th className="py-1 pr-3">Kind</th>
              <th className="py-1">Rows</th>
            </tr>
          </thead>
          <tbody>
            {d.uploads.map((u) => (
              <tr key={u.id} className="border-t border-line">
                <td className="py-1.5 pr-3 whitespace-nowrap">{ist(u.uploaded_at)}</td>
                <td className="py-1.5 pr-3">{u.filename}</td>
                <td className="py-1.5 pr-3">{u.kind}</td>
                <td className="py-1.5 tabular-nums">{u.rows}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
