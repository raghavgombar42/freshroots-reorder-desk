import { db, withDb } from "@/lib/db";
import { Icon } from "../icons";
import { Card, EmptyState, Flash, NoDb, PageHeader, SourceTag, Table, Tag, ist, type SP } from "../ui";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { tone: "data" | "human" | "cut"; label: string }> = {
  ok: { tone: "data", label: "Completed" },
  running: { tone: "human", label: "Running" },
  blocked: { tone: "cut", label: "Blocked" },
  error: { tone: "cut", label: "Error" },
};

export default async function Runs({ searchParams }: { searchParams: SP }) {
  let runs;
  try {
    runs = await withDb(() => db()`select u.*,
      (select count(*) from recommendations r where r.run_id = u.id and r.action <> 'NO_ACTION')::int as flagged,
      (select count(*) from recommendations r where r.run_id = u.id)::int as total,
      (select coalesce(sum(cost_usd), 0) from llm_calls l where l.run_id = u.id)::float as cost,
      (select count(*) from llm_calls l where l.run_id = u.id and not l.ok)::int as ai_failures
      from runs u order by u.id desc limit 50`);
  } catch (e) {
    return <NoDb error={e} />;
  }
  return (
    <div className="space-y-6">
      <Flash searchParams={searchParams} />

      <PageHeader
        eyebrow={
          <>
            <span>Audit · card L</span>
            <SourceTag kind="data" />
          </>
        }
        title="Run log"
        description="Every run, kept for audit: who or what triggered it, which rule version it used, what it flagged, what the AI cost, and why it stopped if it did."
      />

      <Card icon="history" title={`Last ${runs.length} runs`} subtitle="Scheduled runs come from Vercel Cron (Mon + Thu, 7:00 am IST); Run now is Raghav's off-cycle button.">
        {runs.length === 0 ? (
          <EmptyState icon="history" title="No runs yet" />
        ) : (
          <Table head={["Run", "Started", "Trigger", "Status", "Rules", "Flagged", "AI cost", "Notes"]} minWidth={820}>
            {runs.map((r) => {
              const s = STATUS[r.status] ?? { tone: "cut" as const, label: r.status };
              const problems = r.problems as string[];
              return (
                <tr key={r.id}>
                  <td className="font-semibold">#{r.id}</td>
                  <td className="whitespace-nowrap">{ist(r.started_at)}</td>
                  <td className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <Icon name={r.trigger === "cron" ? "clock" : "play"} className="h-3.5 w-3.5 text-muted" />
                      {r.trigger === "cron" ? "Scheduled" : "Run now"}
                    </span>
                  </td>
                  <td>
                    <Tag tone={s.tone}>{s.label}</Tag>
                  </td>
                  <td>v{r.rule_version}</td>
                  <td className="tabular-nums">{r.total ? `${r.flagged} / ${r.total}` : "—"}</td>
                  <td className="whitespace-nowrap tabular-nums">
                    ${Number(r.cost).toFixed(4)}
                    {r.ai_failures ? <span className="text-cut"> · {r.ai_failures} failed</span> : null}
                  </td>
                  <td className="max-w-md text-muted">{problems.length ? problems.slice(0, 3).join(" · ") : <span className="text-muted/70">—</span>}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}
