import { timingSafeEqual } from "node:crypto";
import { withDb } from "@/lib/db";
import { runPipeline } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Card 1: Vercel Cron calls this Mon + Thu at 01:30 UTC (7:00 am IST) with "Authorization: Bearer $CRON_SECRET". */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const got = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  if (!secret || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const r = await withDb(() => runPipeline("cron"));
    return Response.json(r, { status: r.status === "error" ? 500 : 200 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 409 });
  }
}
