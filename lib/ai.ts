import { z } from "zod";
import { db } from "./db";
import { ACTION_LABEL, type Recommendation } from "./engine";

/**
 * Cards 7 and 8: the only AI in the app. Gemini Flash via OpenRouter (course key), Google-only routing.
 * It receives the numbers and the rule decision, and returns WORDS ONLY. The schemas have no quantity
 * or action field, so the model has no way to change what the rules decided (The Cut).
 */
const URL = "https://openrouter.ai/api/v1/chat/completions";

function model() {
  const m = process.env.GEMINI_MODEL || "google/gemini-3.8-flash";
  if (!m.startsWith("google/")) throw new Error(`Only Google Gemini models are allowed, got ${m}`);
  return m;
}

async function callJSON<S extends z.ZodType>(purpose: string, runId: number, system: string, user: string, schema: S): Promise<z.infer<S>> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  delete jsonSchema.$schema;
  const started = Date.now();
  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model(),
          temperature: 0,
          max_tokens: 4096,
          reasoning: { effort: "low", exclude: true },
          provider: { only: ["google-vertex", "google-ai-studio"], allow_fallbacks: false, require_parameters: true },
          usage: { include: true },
          response_format: { type: "json_schema", json_schema: { name: purpose, strict: true, schema: jsonSchema } },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: AbortSignal.timeout(60_000),
      });
      const body = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number; cost_details?: { upstream_inference_cost?: number } };
        error?: { message?: string };
      };
      if (!res.ok) {
        lastErr = `HTTP ${res.status}: ${body.error?.message ?? "error"}`;
        if (res.status === 402 || res.status === 401 || res.status === 400) break;
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }
      const text = body.choices?.[0]?.message?.content ?? "";
      const data = schema.parse(JSON.parse(text.replace(/^```(?:json)?\s*|```\s*$/g, "")));
      await log(runId, purpose, true, body.usage, Date.now() - started);
      return data;
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  await log(runId, purpose, false, undefined, Date.now() - started, lastErr);
  throw new Error(`Gemini ${purpose} failed: ${lastErr}`);
}

async function log(
  runId: number,
  purpose: string,
  ok: boolean,
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number; cost_details?: { upstream_inference_cost?: number } },
  ms?: number,
  error?: string,
) {
  // With a provider key on OpenRouter, `cost` is 0 and the real spend is in upstream_inference_cost.
  const cost = usage?.cost || usage?.cost_details?.upstream_inference_cost || null;
  try {
    await db()`insert into llm_calls (run_id, purpose, model, ok, tokens_in, tokens_out, cost_usd, latency_ms, error)
      values (${runId}, ${purpose}, ${model()}, ${ok}, ${usage?.prompt_tokens ?? null}, ${usage?.completion_tokens ?? null},
              ${cost}, ${ms ?? null}, ${error?.slice(0, 500) ?? null})`;
  } catch {
    /* logging must never break a run */
  }
}

const EXPLAIN_SCHEMA = z.object({
  items: z.array(
    z.object({
      skuId: z.string(),
      unusual: z.string().describe("1–2 sentences: what in these numbers looks unusual or risky"),
      check: z.string().describe("1 sentence: what Raghav should check before deciding"),
    }),
  ),
});

const SYSTEM_EXPLAIN = `You help Raghav, the Senior Demand Planner at Freshroots (regional FMCG, Maharashtra + Goa), review reorder recommendations.
Deterministic rules have ALREADY decided each action and quantity. You never change, question the arithmetic of, or suggest a different quantity or action.
For each SKU, explain in plain English what looks unusual or risky in its numbers, and the one thing Raghav should check before he approves (for example a competitor scheme, a distributor's order pattern, a launch, shelf life).
Use only the numbers given. Do not invent facts, prices, events or distributor names. Be specific and short.`;

/** Card 7: explain each flagged recommendation and each exception. Returns skuId → text. */
export async function explainFlagged(runId: number, recs: Recommendation[]): Promise<Map<string, { unusual: string; check: string }>> {
  const flagged = recs.filter((r) => r.action !== "NO_ACTION");
  const out = new Map<string, { unusual: string; check: string }>();
  if (flagged.length === 0) return out;
  const payload = flagged.map((r) => ({
    skuId: r.skuId,
    name: r.skuName,
    perishability: r.perishability,
    decision: ACTION_LABEL[r.action],
    quantity: r.qty,
    rulesFired: r.rulesFired,
    outsideRules: r.exceptions,
    numbers: r.metrics,
  }));
  const res = await callJSON("explain", runId, SYSTEM_EXPLAIN, `Recommendations to explain:\n${JSON.stringify(payload, null, 1)}`, EXPLAIN_SCHEMA);
  const ids = new Set(flagged.map((r) => r.skuId));
  for (const it of res.items) if (ids.has(it.skuId)) out.set(it.skuId, { unusual: it.unusual, check: it.check });
  return out;
}

const SUMMARY_SCHEMA = z.object({ lines: z.array(z.string()).describe("Exactly 3 short lines") });

/** Card 8: 3-line cycle summary for Deepa. */
export async function cycleSummary(runId: number, recs: Recommendation[], previous: { skuId: string; action: string }[]): Promise<string> {
  const now = recs.map((r) => ({ skuId: r.skuId, name: r.skuName, decision: ACTION_LABEL[r.action], qty: r.qty, cover: r.metrics.weeksOfCover, trendPct: r.metrics.trendPct }));
  const res = await callJSON(
    "summary",
    runId,
    `You write a 3-line operations summary for Deepa Nair, Head of Operations at Freshroots. Line 1: biggest stockout risks. Line 2: overstock / pauses. Line 3: what changed versus the previous run (or "First run" if there is none) and how many SKUs need Raghav's judgment. Use only the data given. No invented numbers.`,
    `This run:\n${JSON.stringify(now)}\n\nPrevious run decisions:\n${JSON.stringify(previous)}`,
    SUMMARY_SCHEMA,
  );
  return res.lines.slice(0, 3).join("\n");
}
