/** Push one run's approved lines to Zoho as draft POs (same code as the Draft POs button). Usage: npm run zoho:push -- <runId> */
import { db } from "../lib/db";
import { pushRunToZoho } from "../lib/zoho";
pushRunToZoho(Number(process.argv[2]))
  .then(async (r) => { console.log(JSON.stringify(r, null, 2)); await db().end(); })
  .catch((e) => { console.error(e.message); process.exit(1); });
