/** Run one full cycle from the terminal (same code path as the cron and the Run now button). */
import { runPipeline } from "../lib/pipeline";
import { db } from "../lib/db";

runPipeline("run_now", process.argv[2])
  .then(async (r) => {
    console.log(JSON.stringify(r, null, 2));
    await db().end();
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
