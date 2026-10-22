/** Applies only the idle-connection guard from db/schema.sql (safe to re-run) and clears current idle sessions. */
import { db } from "../lib/db";
(async () => {
  const sql = db();
  await sql`create extension if not exists pg_cron`;
  await sql.unsafe(`select cron.schedule('close-idle-pooler-sessions', '* * * * *', $$
    select pg_terminate_backend(pid) from pg_stat_activity
    where application_name = 'Supavisor' and state = 'idle' and state_change < now() - interval '2 minutes'
  $$)`);
  const r = await sql`select count(*)::int as n from (select pg_terminate_backend(pid) from pg_stat_activity
    where application_name = 'Supavisor' and state = 'idle' and pid <> pg_backend_pid() and state_change < now() - interval '30 seconds') t`;
  console.log(`Guard scheduled. Closed ${r[0].n} idle pooler sessions now.`);
  await sql.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
