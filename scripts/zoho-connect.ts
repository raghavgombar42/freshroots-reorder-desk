/**
 * One-time: swap the Zoho Self Client grant code (valid 10 minutes) for a long-lived refresh token,
 * find the organisation, and write ZOHO_REFRESH_TOKEN + ZOHO_ORG_ID into .env.local.
 * Prints no secrets. Usage: npm run zoho:connect
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ENV = join(__dirname, "..", ".env.local");
const dc = process.env.ZOHO_DC || "in";

function setEnv(text: string, key: string, value: string | null): string {
  const lines = text.split(/\r?\n/).filter((l) => !l.startsWith(`${key}=`));
  if (value !== null) lines.push(`${key}=${value}`);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

(async () => {
  const { ZOHO_CLIENT_ID: id, ZOHO_CLIENT_SECRET: secret, ZOHO_GRANT_CODE: code } = process.env;
  if (!id || !secret || !code) throw new Error("Need ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET and ZOHO_GRANT_CODE in .env.local");
  const res = await fetch(`https://accounts.zoho.${dc}/oauth/v2/token`, {
    method: "POST",
    body: new URLSearchParams({ grant_type: "authorization_code", client_id: id.trim(), client_secret: secret.trim(), code: code.trim() }),
  });
  const tok = (await res.json()) as { access_token?: string; refresh_token?: string; error?: string };
  if (!tok.refresh_token || !tok.access_token) throw new Error(`Grant exchange failed: ${tok.error ?? res.status} (codes expire after 10 minutes and work once)`);
  const orgs = (await (await fetch(`https://www.zohoapis.${dc}/inventory/v1/organizations`, { headers: { Authorization: `Zoho-oauthtoken ${tok.access_token}` } })).json()) as {
    organizations?: { organization_id: string; name: string }[];
  };
  const org = orgs.organizations?.[0];
  if (!org) throw new Error("Token works but no Zoho Inventory organisation was found. Create one in Zoho Inventory first.");
  let env = readFileSync(ENV, "utf8");
  env = setEnv(env, "ZOHO_GRANT_CODE", null);
  env = setEnv(env, "ZOHO_REFRESH_TOKEN", tok.refresh_token);
  env = setEnv(env, "ZOHO_ORG_ID", org.organization_id);
  env = setEnv(env, "ZOHO_DC", dc);
  writeFileSync(ENV, env);
  console.log(`Connected to Zoho Inventory organisation "${org.name}" (${orgs.organizations!.length} found). Saved to .env.local.`);
})().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
