# Freshroots Reorder Desk

MESA Term 2 · AI Systems Thinking (Mihirr Sose) · Case 01 "Deepa's 90-Day Mandate" · **Option A: Demand Planning**

**Live:** https://freshroots-reorder-desk-three.vercel.app · Components map: `/components-map.png`

Twice a week (Mon + Thu, 7:00 am IST) the desk reads the SAP export, checks it, applies Raghav's five written rules to every SKU, asks Gemini to explain only the flagged ones, and puts a recommendation sheet in front of Raghav. Approved lines become draft POs (Zoho-format CSV). **AI proposes, code decides, Raghav approves.**

## How it maps to the components map

| Card | What | Where |
|---|---|---|
| 0 | Run now | `app/actions.ts` → `runNow` |
| 1 | Cron Mon + Thu 01:30 UTC | `vercel.json`, `app/api/cron/run/route.ts` |
| 2 | SAP CSV export (pilot: upload) | `app/upload`, `lib/ingest.ts` |
| 3–4 | Validate, compute cover | `lib/engine.ts` (`validate`, `computeMetrics`) |
| 5–6 | Rules in fixed order, exceptions | `lib/engine.ts` (`recommend`) |
| 7–8 | Gemini explains flagged recs + 3-line summary (words only) | `lib/ai.ts` |
| R | Rule numbers, versioned, editable | `app/rules`, `rule_settings` table |
| A / 9 / 11 | Approve / edit / reject + reason, reject rate | `app/page.tsx`, `decisions` table |
| 10 / 12 | Draft PO lines → Zoho CSV | `po_lines`, `app/api/po-csv` |
| 13 / F | Loss tracker vs ₹28–34 L/qtr, kill criteria, forecast vs actual | `app/tracker` |
| 14 | Recommendation sheet | `app/page.tsx` |

**The Cut:** never places a PO (Raghav approves, procurement orders); never lets AI set a quantity (the AI's output schema has no quantity field); never guesses missing or stale data (the run is blocked).

## Run locally

```
npm install
npm test              # 12-case eval set for the rules engine
npm run db:setup      # tables + the 5 case CSVs + rules v1 (needs DATABASE_URL)
npm run run:once      # one full cycle from the terminal
npm run dev
```

`.env.local`: `OPENROUTER_API_KEY`, `GEMINI_MODEL` (google/…), `DATABASE_URL` (Supabase **Session pooler**, port 5432), `CRON_SECRET`, `OPERATOR_PASSCODE`.

## Notes
- The stock snapshot in the case data is dated 19 Oct 2026. Runs block once it is more than 3 days old (rule setting). For a demo, use **SAP data → Simulate SAP stock refresh** (clearly labelled pilot-only).
- The case data has no unit prices, so ₹ losses are entered per period on the Loss tracker; the counter-metric tracks units on hand.
- Connections: request-scoped clients always closed + a pg_cron job closing pooler sessions idle > 2 min (Vercel freezes instances with sockets open; the session pooler allows ~15).
