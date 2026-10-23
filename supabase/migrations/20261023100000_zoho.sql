-- Card 12, live: link draft PO lines to Zoho Inventory. Idempotent.

-- Which Zoho vendor / item each distributor / SKU became (created once, reused after)
create table if not exists zoho_vendors (
  vendor_id text primary key references distributors(id),
  zoho_contact_id text not null,
  created_at timestamptz not null default now()
);
create table if not exists zoho_items (
  sku_id text primary key references skus(id),
  zoho_item_id text not null,
  created_at timestamptz not null default now()
);

-- One Zoho draft PO per distributor per run. The unique key means a run can never be pushed twice.
-- zoho_po_id is null only while a push is in progress.
create table if not exists zoho_pos (
  id bigserial primary key,
  run_id bigint not null references runs(id) on delete cascade,
  vendor_id text not null,
  zoho_po_id text,
  zoho_po_number text,
  line_count integer not null,
  pushed_at timestamptz not null default now(),
  unique (run_id, vendor_id)
);

alter table po_lines add column if not exists zoho_po_id text;
