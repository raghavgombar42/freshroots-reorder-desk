import { db } from "./db";

/**
 * Card 12, live: Zoho Inventory (India data centre) via a Self Client OAuth refresh token.
 * Creates DRAFT purchase orders only. The desk never issues a PO: procurement opens the draft in Zoho and places it.
 * Distributors become Zoho vendors and SKUs become Zoho items the first time they are needed (mapping kept in Supabase).
 */
const DC = () => process.env.ZOHO_DC || "in";
const ACCOUNTS = () => `https://accounts.zoho.${DC()}`;
const API = () => `https://www.zohoapis.${DC()}/inventory/v1`;

export function zohoConfigured(): boolean {
  return Boolean(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET && process.env.ZOHO_REFRESH_TOKEN && process.env.ZOHO_ORG_ID);
}

const cache = globalThis as unknown as { zohoToken?: { token: string; until: number } };

async function accessToken(): Promise<string> {
  if (cache.zohoToken && cache.zohoToken.until > Date.now() + 60_000) return cache.zohoToken.token;
  const body = new URLSearchParams({
    refresh_token: process.env.ZOHO_REFRESH_TOKEN ?? "",
    client_id: process.env.ZOHO_CLIENT_ID ?? "",
    client_secret: process.env.ZOHO_CLIENT_SECRET ?? "",
    grant_type: "refresh_token",
  });
  const res = await fetch(`${ACCOUNTS()}/oauth/v2/token`, { method: "POST", body, signal: AbortSignal.timeout(20_000) });
  const j = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!j.access_token) throw new Error(`Zoho token refresh failed: ${j.error ?? res.status}`);
  cache.zohoToken = { token: j.access_token, until: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return j.access_token;
}

type ZohoResp = { code: number; message: string } & Record<string, unknown>;

async function zoho(method: "GET" | "POST" | "PUT", path: string, query: Record<string, string> = {}, json?: unknown): Promise<ZohoResp> {
  const url = new URL(`${API()}${path}`);
  url.searchParams.set("organization_id", process.env.ZOHO_ORG_ID ?? "");
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Zoho-oauthtoken ${await accessToken()}`, ...(json ? { "Content-Type": "application/json" } : {}) },
      body: json ? JSON.stringify(json) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const j = (await res.json().catch(() => ({ code: res.status, message: `HTTP ${res.status}` }))) as ZohoResp;
    if (res.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    if (res.status === 401 && attempt === 0) {
      cache.zohoToken = undefined; // token expired early: refresh once
      continue;
    }
    if (j.code !== 0) throw new Error(`Zoho ${method} ${path}: ${j.message ?? res.status}`);
    return j;
  }
}

async function vendorId(distributorId: string): Promise<string> {
  const sql = db();
  const [m] = await sql`select zoho_contact_id from zoho_vendors where vendor_id = ${distributorId}`;
  if (m) return m.zoho_contact_id;
  const [d] = await sql`select id, name, region from distributors where id = ${distributorId}`;
  const name = d ? `${d.name} (${d.id})` : distributorId;
  const found = (await zoho("GET", "/contacts", { contact_name: name, contact_type: "vendor" })).contacts as { contact_id: string }[] | undefined;
  const id =
    found?.[0]?.contact_id ??
    ((await zoho("POST", "/contacts", {}, { contact_name: name, company_name: d?.name ?? name, contact_type: "vendor", notes: `Freshroots distributor ${distributorId}, ${d?.region ?? ""}` }))
      .contact as { contact_id: string }).contact_id;
  await sql`insert into zoho_vendors (vendor_id, zoho_contact_id) values (${distributorId}, ${id}) on conflict (vendor_id) do nothing`;
  return id;
}

async function itemId(skuId: string): Promise<string> {
  const sql = db();
  const [m] = await sql`select zoho_item_id from zoho_items where sku_id = ${skuId}`;
  if (m) return m.zoho_item_id;
  const [s] = await sql`select id, name from skus where id = ${skuId}`;
  // Purchase orders only accept items that carry purchase information, so items are "sales_and_purchases".
  const PURCHASABLE = { item_type: "sales_and_purchases", purchase_rate: 0, purchase_description: "Freshroots SKU (price set by procurement)" };
  const found = (await zoho("GET", "/items", { sku: skuId })).items as { item_id: string; sku?: string }[] | undefined;
  const existing = found?.find((i) => i.sku === skuId)?.item_id;
  if (existing) await zoho("PUT", `/items/${existing}`, {}, PURCHASABLE); // make an older sales-only item purchasable
  const id =
    existing ??
    ((await zoho("POST", "/items", {}, { name: s?.name ?? skuId, sku: skuId, unit: "Units", rate: 0, product_type: "goods", ...PURCHASABLE })).item as { item_id: string })
      .item_id;
  await sql`insert into zoho_items (sku_id, zoho_item_id) values (${skuId}, ${id}) on conflict (sku_id) do nothing`;
  return id;
}

export type PushResult = { vendor: string; status: "created" | "already" | "failed"; poNumber?: string; error?: string };

/** Push a run's approved PO lines to Zoho as draft POs, one per distributor. Safe to click twice. */
export async function pushRunToZoho(runId: number): Promise<PushResult[]> {
  if (!zohoConfigured()) throw new Error("Zoho is not connected (ZOHO_* settings missing).");
  const sql = db();
  const lines = await sql`select p.id, p.sku_id, p.vendor_id, p.qty, u.run_date from po_lines p join runs u on u.id = p.run_id
    where p.run_id = ${runId} order by p.vendor_id, p.sku_id`;
  const byVendor = new Map<string, typeof lines>();
  for (const l of lines) byVendor.set(l.vendor_id, [...(byVendor.get(l.vendor_id) ?? []), l] as typeof lines);

  const results: PushResult[] = [];
  for (const [vendor, ls] of byVendor) {
    const ref = `RD-${runId}-${vendor}`;
    // Claim this (run, vendor) first; the unique key stops a second click or a parallel request.
    const claimed = await sql`insert into zoho_pos (run_id, vendor_id, line_count) values (${runId}, ${vendor}, ${ls.length})
      on conflict (run_id, vendor_id) do nothing returning id`;
    if (claimed.length === 0) {
      const [ex] = await sql`select zoho_po_number from zoho_pos where run_id = ${runId} and vendor_id = ${vendor}`;
      results.push({ vendor, status: "already", poNumber: ex?.zoho_po_number ?? "in progress" });
      continue;
    }
    try {
      // If an earlier push created the PO but crashed before saving, find it instead of creating a duplicate.
      const existing = ((await zoho("GET", "/purchaseorders", { reference_number: ref })).purchaseorders as
        | { purchaseorder_id: string; purchaseorder_number: string; reference_number: string }[]
        | undefined)?.find((p) => p.reference_number === ref);
      let po = existing;
      if (!po) {
        const vendorZohoId = await vendorId(vendor);
        const lineItems = [];
        for (const l of ls) lineItems.push({ item_id: await itemId(l.sku_id), quantity: l.qty, rate: 0 });
        po = (
          await zoho("POST", "/purchaseorders", {}, {
            vendor_id: vendorZohoId,
            date: ls[0].run_date,
            reference_number: ref,
            line_items: lineItems,
            notes: `Draft from Freshroots Reorder Desk run #${runId}, approved by Raghav. Prices to be filled by procurement before issuing.`,
          })
        ).purchaseorder as { purchaseorder_id: string; purchaseorder_number: string; reference_number: string };
      }
      await sql.begin(async (tx) => {
        await tx`update zoho_pos set zoho_po_id = ${po!.purchaseorder_id}, zoho_po_number = ${po!.purchaseorder_number} where run_id = ${runId} and vendor_id = ${vendor}`;
        await tx`update po_lines set zoho_po_id = ${po!.purchaseorder_id} where run_id = ${runId} and vendor_id = ${vendor}`;
      });
      results.push({ vendor, status: existing ? "already" : "created", poNumber: po.purchaseorder_number });
    } catch (e) {
      await sql`delete from zoho_pos where run_id = ${runId} and vendor_id = ${vendor} and zoho_po_id is null`;
      results.push({ vendor, status: "failed", error: (e as Error).message });
    }
  }
  return results;
}

export function zohoPoUrl(poId: string): string {
  return `https://inventory.zoho.${DC()}/app/${process.env.ZOHO_ORG_ID}#/purchaseorders/${poId}`;
}
