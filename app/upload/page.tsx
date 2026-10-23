import { db, withDb } from "@/lib/db";
import { isOperator } from "@/lib/auth";
import { simulateStockRefresh, uploadCsv } from "../actions";
import { SubmitButton } from "../buttons";
import { Icon } from "../icons";
import { Card, EmptyState, Flash, NoDb, Notice, PageHeader, SourceTag, Stat, Table, Tag, ist, type SP } from "../ui";

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
        eyebrow={
          <>
            <span>Setup · card 2</span>
            <SourceTag kind="data" />
          </>
        }
        title="SAP data"
        description={
          <>
            The inputs every run reads. In production IT drops the SAP export twice a week; in this pilot the files are{" "}
            <b className="font-semibold text-ink">uploaded here</b>. Each run checks them first: missing SKUs, negative stock or gaps in weeks stop the
            run instead of being guessed.
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon="box" label="SKUs" value={c.skus} sub="Pilot sample of Freshroots' ~400" />
        <Stat icon="chart" label="Weekly sales rows" value={c.sales} sub={`${c.first_week ?? "—"} → ${c.last_week ?? "—"}`} />
        <Stat icon="clock" label="Latest stock snapshot" value={c.stock_as_of ?? "—"} sub="As-of date of stock on hand" />
        <Stat icon="database" label="Distributors · calendar months" value={`${c.distributors} · ${c.months}`} sub="Distributor master · festival calendar" />
      </div>

      {operator ? (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card icon="upload" title="Upload SAP export files" subtitle="CSV, one or more at a time. Re-uploading the same rows changes nothing.">
            <form action={uploadCsv} className="space-y-3">
              <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-line bg-paper/60 px-4 py-6 text-center transition-colors hover:border-data/50 hover:bg-data-soft/40">
                <Icon name="upload" className="h-5 w-5 text-muted" />
                <span className="text-[13px] font-medium">Choose CSV files</span>
                <span className="text-[12px] text-muted">The file type is recognised from its header row</span>
                <input type="file" name="files" accept=".csv,text/csv" multiple className="mt-2 max-w-full text-[12px]" />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1">
                  {Object.values(KIND_LABEL).map((k) => (
                    <Tag key={k}>{k}</Tag>
                  ))}
                </div>
                <SubmitButton variant="approve" icon="upload" pendingText="Uploading…">
                  Upload
                </SubmitButton>
              </div>
            </form>
          </Card>
          <Card icon="clock" title="Simulated SAP refresh" subtitle="Pilot only. There is no live SAP connection yet." tone="human">
            <p className="text-[13px] leading-relaxed text-ink/80">
              Copies the latest stock snapshot to today&apos;s date, standing in for IT&apos;s scheduled stock export. Stock figures are unchanged; only the
              as-of date is new. Each refresh is logged below.
            </p>
            <form action={simulateStockRefresh} className="mt-3">
              <SubmitButton variant="outlineHuman" icon="clock" pendingText="Refreshing…">
                Simulate SAP stock refresh
              </SubmitButton>
            </form>
          </Card>
        </div>
      ) : (
        <Notice tone="info" title="View only">
          Unlock the desk to upload SAP files or run a simulated stock refresh.
        </Notice>
      )}

      <Card icon="history" title="Upload history" subtitle="Last 15 loads, including simulated refreshes.">
        {d.uploads.length === 0 ? (
          <EmptyState icon="upload" title="No uploads yet" />
        ) : (
          <Table head={["When", "File", "Type", "Rows"]}>
            {d.uploads.map((u) => (
              <tr key={u.id}>
                <td className="whitespace-nowrap">{ist(u.uploaded_at)}</td>
                <td>
                  {String(u.filename).startsWith("simulated") ? (
                    <span className="flex items-center gap-1.5">
                      {u.filename} <Tag tone="human">simulated</Tag>
                    </span>
                  ) : (
                    <span className="font-mono text-[12px]">{u.filename}</span>
                  )}
                </td>
                <td>{KIND_LABEL[u.kind] ?? u.kind}</td>
                <td className="tabular-nums">{u.rows}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
