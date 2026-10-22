-- Initial schema (same as db/schema.sql). Idempotent, so applying it to the existing database changes nothing.
-- Freshroots Reorder Desk: Supabase Postgres schema. Card letters match the components map.
-- Idempotent: safe to run again.

-- D: history (from the SAP export, card 2)
create table if not exists skus (
  id text primary key,
  name text not null,
  category text not null,
  perishability text not null check (perishability in ('Low', 'High')),
  std_qty integer not null check (std_qty > 0),
  distributor_id text not null
);
create table if not exists distributors (
  id text primary key, name text not null, region text not null, status text not null
);
create table if not exists calendar_months (
  year_month text primary key, festival boolean not null
);
create table if not exists weekly_sales (
  sku_id text not null references skus(id),
  week text not null check (week ~ '^\d{4}-W\d{2}$'),
  units integer not null check (units >= 0),
  primary key (sku_id, week)
);
create table if not exists stock_snapshots (
  id bigserial primary key,
  sku_id text not null references skus(id),
  location text not null,
  units integer not null check (units >= 0),
  as_of date not null,
  loaded_at timestamptz not null default now(),
  unique (sku_id, location, as_of)
);
create table if not exists uploads (
  id bigserial primary key,
  kind text not null,
  filename text,
  rows integer not null,
  uploaded_at timestamptz not null default now()
);

-- R: Raghav's rule numbers, versioned. The newest row is the live version; old rows are never changed.
create table if not exists rule_settings (
  version bigserial primary key,
  settings jsonb not null,
  note text,
  created_at timestamptz not null default now()
);

-- L: run log
create table if not exists runs (
  id bigserial primary key,
  trigger text not null check (trigger in ('cron', 'run_now')),
  run_date date not null,
  status text not null check (status in ('running', 'ok', 'blocked', 'error')),
  problems jsonb not null default '[]',
  rule_version bigint references rule_settings(version),
  festival boolean,
  summary text,            -- card 8 (AI), null if the AI call failed
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- Cards 5–7 + 14: one recommendation per SKU per run
create table if not exists recommendations (
  id bigserial primary key,
  run_id bigint not null references runs(id) on delete cascade,
  sku_id text not null references skus(id),
  action text not null check (action in ('REORDER_NOW', 'REORDER_UP', 'PAUSE', 'NO_ACTION', 'RAGHAV_DECIDES')),
  qty integer not null check (qty >= 0),
  rules_fired jsonb not null,
  exceptions jsonb not null,
  reason text not null,
  metrics jsonb not null,
  ai_unusual text,          -- card 7: explanation only, never a quantity
  ai_check text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'edited', 'rejected')),
  unique (run_id, sku_id)
);

-- 11: decision log (one decision per recommendation; pending → decided is one-way)
create table if not exists decisions (
  id bigserial primary key,
  recommendation_id bigint not null unique references recommendations(id) on delete cascade,
  decision text not null check (decision in ('approved', 'edited', 'rejected')),
  final_qty integer check (final_qty >= 0),
  reason text,
  decided_at timestamptz not null default now(),
  check (decision <> 'rejected' or (reason is not null and length(trim(reason)) > 0)),
  check (decision <> 'edited' or (reason is not null and length(trim(reason)) > 0))
);

-- 10: draft PO lines, only from approved/edited recommendations; one per SKU per run
create table if not exists po_lines (
  id bigserial primary key,
  run_id bigint not null references runs(id) on delete cascade,
  recommendation_id bigint not null unique references recommendations(id) on delete cascade,
  sku_id text not null references skus(id),
  vendor_id text not null,
  qty integer not null check (qty > 0),
  created_at timestamptz not null default now(),
  unique (run_id, sku_id)
);

-- 13: loss tracker (Deepa enters actual losses for each 3–4 week period)
create table if not exists loss_entries (
  id bigserial primary key,
  period_start date not null,
  period_end date not null check (period_end > period_start),
  stockout_inr numeric not null check (stockout_inr >= 0),
  writeoff_inr numeric not null check (writeoff_inr >= 0),
  note text,
  entered_at timestamptz not null default now()
);

-- AI cost log
create table if not exists llm_calls (
  id bigserial primary key,
  run_id bigint references runs(id) on delete set null,
  purpose text not null,
  model text not null,
  ok boolean not null,
  tokens_in integer,
  tokens_out integer,
  cost_usd numeric,
  latency_ms integer,
  error text,
  created_at timestamptz not null default now()
);

-- Only one run at a time
create unique index if not exists one_running_run on runs ((status)) where status = 'running';

-- Guard against leaked pooler sessions: Vercel freezes serverless instances with sockets still open, and the
-- session pooler only allows ~15 clients. Every minute, close pooled connections that have been idle > 2 min.
create extension if not exists pg_cron;
select cron.schedule('close-idle-pooler-sessions', '* * * * *', $$
  select pg_terminate_backend(pid) from pg_stat_activity
  where application_name = 'Supavisor' and state = 'idle' and state_change < now() - interval '2 minutes'
$$);
