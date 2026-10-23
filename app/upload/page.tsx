import { db, withDb } from "@/lib/db";
import { isOperator } from "@/lib/auth";
import { simulateStockRefresh, uploadCsv } from "../actions";
import { SubmitButton } from "../buttons";
import { Icon } from "../icons";
import { Card, EmptyState, Flash, NoDb, Notice, PageHeader, Stat, StatGrid, Table, Tag, ist, type SP } from "../ui";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  sku_master: "SKU master",
  weekly_sales: "Weekly sales",
  current_inventory: "Stock on hand",
  distributor_master: "Distributors",
  calendar: "Festival calendar",
};

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
    <div className="space-y-6">
      <Flash searchParams={searchParams} />

      <PageHeader
        eyebrow={<span>Setup</span>}
        title="SAP data"
        description={
          <>
            The inputs every run reads. In production IT drops the SAP export twice a week; in this pilot the files are{" "}
            <span className="text-ink">uploaded here</span>. Each run checks them first: missing SKUs, negative stock or gaps in weeks stop the run
            instead of being guessed.
          </>
        }
      />

      <StatGrid>
        <Stat label="SKUs" value={c.skus} sub="Pilot sample of Freshroots' ~400" />
        <Stat label="Weekly sales rows" value={c.sales} sub={`${c.first_week ?? "—"} → ${c.last_week ?? "—"}`} />
        <Stat label="Latest stock snapshot" value={c.stock_as_of ?? "—"} sub="As-of date of stock on hand" />
        <Stat label="Distributors · months" value={`${c.distributors} · ${c.months}`} sub="Distributor master · festival calendar" />
      </StatGrid>

      {operator ? (
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <Card title="Upload SAP export files" subtitle="CSV, one or more at a time. Re-uploading the same rows changes nothing.">
            <form action={uploadCsv} className="space-y-3">
              <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line-strong bg-sunk/50 px-4 py-5 text-center transition-colors hover:border-rail/40 hover:bg-rail-soft/50">
                <Icon name="upload" className="h-5 w-5 text-faint" />
                <span className="text-[13.5px] font-medium">Choose CSV files</span>
                <span className="text-[12.5px] text-muted">The type is recognised from each file&apos;s header row</span>
                <input type="file" name="files" accept=".csv,text/csv" multiple className="mt-2 max-w-full text-[12.5px] text-muted" />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1">
                  {Object.values(KIND_LABEL).map((k) => (
                    <Tag key={k}>{k}</Tag>
                  ))}
                </div>
                <SubmitButton variant="primary" icon="upload" pendingText="Uploading…">
                  Upload
                </SubmitButton>
              </div>
            </form>
          </Card>
          <Card title="Simulated SAP refresh" subtitle="Pilot only. There is no live SAP connection yet.">
            <p className="text-[13.5px] leading-relaxed text-muted">
              Copies the latest stock snapshot to today&apos;s date, standing in for IT&apos;s scheduled stock export. Stock figures are unchanged; only the
              as-of date is new. Each refresh is logged below.
            </p>
            <form action={simulateStockRefresh} className="mt-3">
              <SubmitButton variant="secondary" icon="clock" pendingText="Refreshing…">
                Simulate SAP stock refresh
              </SubmitButton>
            </form>
          </Card>
        </div>
      ) : (
        <Notice title="View only.">Unlock the desk to upload SAP files or run a simulated stock refresh.</Notice>
      )}

      <Card flush title="Upload history" subtitle="Last 15 loads, including simulated refreshes.">
        {d.uploads.length === 0 ? (
          <EmptyState compact icon="upload" title="No uploads yet" />
        ) : (
          <Table head={["When", "File", "Type", { label: "Rows", align: "right" }]}>
            {d.uploads.map((u) => (
              <tr key={u.id}>
                <td className="num whitespace-nowrap">{ist(u.uploaded_at)}</td>
                <td>
                  {String(u.filename).startsWith("simulated") ? (
                    <span className="flex items-center gap-2">
                      {u.filename} <Tag tone="human">Simulated</Tag>
                    </span>
                  ) : (
                    <span className="font-mono text-[12.5px]">{u.filename}</span>
                  )}
                </td>
                <td className="text-muted">{KIND_LABEL[u.kind] ?? u.kind}</td>
                <td className="num text-right">{u.rows}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
