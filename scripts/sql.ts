/** Read-only check: print a query's rows. Usage: tsx --env-file=.env.local scripts/sql.ts "select ..." */
import { db } from "../lib/db";
db().unsafe(process.argv[2]).then(async (r) => { console.table(r); await db().end(); });
