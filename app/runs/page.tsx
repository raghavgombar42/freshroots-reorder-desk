import { db, withDb } from "@/lib/db";
import { Card, Flash, NoDb, Tag, ist, type SP } from "../ui";

export const dynamic = "force-dynamic";

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
    <div className="space-y-5">
      <Flash searchParams={searchParams} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Run log (card L)</h1>
        <p className="text-sm text-muted">Every run: who triggered it, which rule version it used, what it flagged, AI cost, and why it stopped if it did.</p>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted">
              <tr>
                <th className="py-1 pr-3">Run</th>
                <th className="py-1 pr-3">Started</th>
                <th className="py-1 pr-3">Trigger</th>
                <th className="py-1 pr-3">Status</th>
                <th className="py-1 pr-3">Rules</th>
                <th className="py-1 pr-3">Flagged</th>
                <th className="py-1 pr-3">AI cost</th>
                <th className="py-1">Problems</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-line align-top">
                  <td className="py-1.5 pr-3">#{r.id}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{ist(r.started_at)}</td>
                  <td className="py-1.5 pr-3">{r.trigger === "cron" ? "Cron" : "Run now"}</td>
                  <td className="py-1.5 pr-3">
                    <Tag tone={r.status === "ok" ? "data" : r.status === "running" ? "human" : "cut"}>{r.status}</Tag>
                  </td>
                  <td className="py-1.5 pr-3">v{r.rule_version}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{r.total ? `${r.flagged} / ${r.total}` : "—"}</td>
                  <td className="py-1.5 pr-3 tabular-nums">${Number(r.cost).toFixed(4)}{r.ai_failures ? <span className="text-cut"> · {r.ai_failures} failed</span> : null}</td>
                  <td className="py-1.5 text-muted">{(r.problems as string[]).slice(0, 3).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
