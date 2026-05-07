/**
 * Probe which Tink Data Enrichment products are enabled on the current contract.
 *
 * For each candidate scope, attempts a non-delegated authorization-grant against a
 * fresh probe Tink user. Tink rejects scopes that are not on the client's contract
 * with a 400 / "invalid_scope" / "not_allowed_scope" style error, so success of the
 * grant is a reliable signal that the product is provisioned.
 *
 * The grant code is never redeemed; the probe is non-destructive and idempotent
 * (the probe Tink user is reused across runs via a deterministic external_user_id).
 *
 * Usage:
 *   node apps/api/scripts/probe-tink-enrichment.mjs
 *
 * Reads TINK_CLIENT_ID / TINK_CLIENT_SECRET / TINK_API_BASE_URL / TINK_MARKET /
 * TINK_LOCALE from apps/api/.env(.local) or repo root .env(.local).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(apiRoot, "..", "..");

for (const envPath of [
  resolve(apiRoot, ".env.local"),
  resolve(apiRoot, ".env"),
  resolve(repoRoot, ".env.local"),
  resolve(repoRoot, ".env")
]) {
  if (!existsSync(envPath)) continue;
  const parsed = parse(readFileSync(envPath));
  for (const [key, value] of Object.entries(parsed)) {
    process.env[key] ??= value;
  }
}

const clientId = process.env.TINK_CLIENT_ID;
const clientSecret = process.env.TINK_CLIENT_SECRET;
const apiBase = process.env.TINK_API_BASE_URL ?? "https://api.tink.com";
const market = process.env.TINK_MARKET ?? "GB";
const locale = process.env.TINK_LOCALE ?? "en_US";

if (!clientId || !clientSecret) {
  console.error("Missing TINK_CLIENT_ID or TINK_CLIENT_SECRET. Set them in apps/api/.env.local.");
  process.exit(1);
}

async function getClientToken(scope) {
  const res = await fetch(`${apiBase}/api/v1/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope
    })
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`client_credentials(${scope}) failed ${res.status}: ${JSON.stringify(json)}`);
  }
  return json.access_token;
}

async function ensureProbeUser() {
  const accessToken = await getClientToken("user:create");
  const externalUserId = "wise-finance-probe:enrichment";
  const res = await fetch(`${apiBase}/api/v1/user/create`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ external_user_id: externalUserId, market, locale })
  });
  const json = await res.json().catch(() => null);
  if (res.ok && json?.user_id) {
    return { user_id: json.user_id, externalUserId, created: true };
  }
  // If user already exists, Tink returns a 4xx with a code we can probably ignore.
  // Fall back to looking up by external_user_id via authorization-grant which accepts
  // either user_id or external_user_id depending on the variant. We use the explicit
  // /api/v1/user/external-user-id route if it exists; if not, treat the conflict as success
  // and attempt the grant with external_user_id.
  if (json && /already.exist|conflict|409/i.test(JSON.stringify(json))) {
    return { user_id: undefined, externalUserId, created: false };
  }
  throw new Error(
    `user/create failed ${res.status}: ${JSON.stringify(json)}; cannot proceed without probe user`
  );
}

async function tryGrant(scope, user) {
  const accessToken = await getClientToken("authorization:grant");
  const body = new URLSearchParams({ scope });
  if (user.user_id) body.set("user_id", user.user_id);
  else body.set("external_user_id", user.externalUserId);

  const res = await fetch(`${apiBase}/api/v1/oauth/authorization-grant`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });
  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, payload: json };
}

const candidates = [
  // baseline: should always pass on a working contract
  "accounts:read",
  "transactions:read",
  "balances:read",
  "provider-consents:read",
  "user:read",
  "credentials:read",
  "credentials:refresh",
  // enrichment / data-decisioning — primary names from public docs
  "transactions:enrichment",
  "recurring-transactions:read",
  "income-check:read",
  "expense-check:read",
  "balance-prediction:read",
  // alternative forms
  "enrichment:read",
  "insights:read",
  "recurring:read",
  "income:read",
  "expense:read",
  "predictions:read",
  // sentinel: a deliberately invented scope so we can distinguish
  // "name unrecognized" from "name recognized but not on contract"
  "totally-fake-scope:read"
];

const probeUser = await ensureProbeUser();
console.log(`Probe user: external_user_id=${probeUser.externalUserId} created=${probeUser.created} user_id=${probeUser.user_id ?? "(unknown — using external_user_id)"}\n`);

const results = [];
for (const scope of candidates) {
  let outcome;
  try {
    outcome = await tryGrant(scope, probeUser);
  } catch (error) {
    outcome = { ok: false, status: 0, payload: { errorMessage: error.message } };
  }
  results.push({ scope, ...outcome });
  const tag = outcome.ok ? "PASS" : `FAIL (${outcome.status})`;
  const detail = outcome.ok
    ? ""
    : ` — ${outcome.payload?.errorMessage ?? outcome.payload?.error_description ?? JSON.stringify(outcome.payload).slice(0, 160)}`;
  console.log(`  ${tag.padEnd(11)} ${scope}${detail}`);
}

console.log("\nSummary:");
const granted = results.filter((r) => r.ok).map((r) => r.scope);
const denied = results.filter((r) => !r.ok).map((r) => r.scope);
console.log("  granted:", granted.join(", ") || "(none)");
console.log("  denied: ", denied.join(", ") || "(none)");

const enrichmentScopes = [
  "transactions:enrichment",
  "recurring-transactions:read",
  "income-check:read",
  "expense-check:read",
  "balance-prediction:read"
];
const enrichmentGranted = enrichmentScopes.filter((s) => granted.includes(s));
const enrichmentDenied = enrichmentScopes.filter((s) => denied.includes(s));

console.log("\nEnrichment / data-decisioning verdict:");
console.log("  on-contract:  ", enrichmentGranted.join(", ") || "(none)");
console.log("  not-on-contract:", enrichmentDenied.join(", ") || "(none)");
