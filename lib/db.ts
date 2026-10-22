import { AsyncLocalStorage } from "node:async_hooks";
import postgres from "postgres";

/**
 * Supabase Postgres via the SESSION pooler (port 5432), which allows only ~15 clients in total.
 * Serverless instances that Vercel freezes keep their sockets open, so long-lived pools run out of slots
 * ("EMAXCONNSESSION max clients reached", seen on the first deploy, same as Term 1's End Term build). So:
 * - page loads and actions use a request-scoped client (`withDb`) that is ALWAYS closed afterwards, and
 *   retry with a short wait when the pool is full;
 * - scripts and the pipeline outside a request use one small client that drops idle sockets within seconds.
 * No prepared statements (pooler-safe).
 */
type Sql = postgres.Sql;

const OPTIONS: postgres.Options<Record<string, postgres.PostgresType>> = {
  prepare: false,
  connect_timeout: 10,
  onnotice: () => {},
  // Dates as plain YYYY-MM-DD strings, no timezone shifting.
  types: { date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x } },
};

function url(): string {
  const u = process.env.DATABASE_URL;
  if (!u) throw new Error("DATABASE_URL is not set. Add the Supabase Session pooler URI to .env.local / Vercel env.");
  return u;
}

const scope = new AsyncLocalStorage<Sql>();
const globalForDb = globalThis as unknown as { sql?: Sql };

/** Inside withDb(): the request's own client. Elsewhere (scripts): one small shared client. */
export function db(): Sql {
  const scoped = scope.getStore();
  if (scoped) return scoped;
  if (!globalForDb.sql) globalForDb.sql = postgres(url(), { ...OPTIONS, max: 2, idle_timeout: 2, max_lifetime: 60 });
  return globalForDb.sql;
}

const poolFull = (e: unknown) => /EMAXCONN|max clients reached/i.test(String((e as Error)?.message));

/** Run `work` on a fresh client that is always closed afterwards; retry up to 4 times if the pool is full. */
export async function withDb<T>(work: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const sql = postgres(url(), { ...OPTIONS, max: 2, idle_timeout: 0 });
    try {
      return await scope.run(sql, work);
    } catch (e) {
      if (!poolFull(e) || attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    } finally {
      sql.end({ timeout: 1 }).catch(() => {});
    }
  }
}
