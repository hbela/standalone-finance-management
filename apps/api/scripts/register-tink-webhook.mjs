/**
 * Manage Tink webhook endpoints.
 *
 * Tink issues the HMAC signing secret when a webhook endpoint is created via
 * POST /events/v2/webhook-endpoints, and shows it exactly once in that response.
 * This script wraps the create / list / delete operations so the secret can be
 * captured into TINK_WEBHOOK_SECRET without hand-rolling curl.
 *
 * Usage:
 *   node apps/api/scripts/register-tink-webhook.mjs list
 *   node apps/api/scripts/register-tink-webhook.mjs create --url https://api.example.com/integrations/tink/webhook
 *   node apps/api/scripts/register-tink-webhook.mjs create --url <url> --description "wise-finance prod" --events refresh:finished,account:updated
 *   node apps/api/scripts/register-tink-webhook.mjs delete <endpoint-id>
 *
 * Reads TINK_CLIENT_ID / TINK_CLIENT_SECRET / TINK_API_BASE_URL from
 * apps/api/.env(.local) or repo-root .env(.local).
 *
 * The endpoint URL must be publicly reachable over HTTPS at registration time,
 * otherwise Tink rejects the request. The secret is shown ONCE in the create
 * response — copy it into TINK_WEBHOOK_SECRET immediately. If lost, delete the
 * endpoint and re-create.
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

if (!clientId || !clientSecret) {
  console.error("Missing TINK_CLIENT_ID or TINK_CLIENT_SECRET. Set them in apps/api/.env.local.");
  process.exit(1);
}

const DEFAULT_EVENTS = [
  "refresh:finished",
  "account-transactions:modified",
  "account:created",
  "account:updated"
];

const argv = process.argv.slice(2);
const command = argv[0];

if (!command || command === "--help" || command === "-h") {
  printUsage();
  process.exit(command ? 0 : 1);
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

async function tinkFetch(token, path, init = {}) {
  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {})
    }
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* leave as null */ }
  return { ok: res.ok, status: res.status, json, text };
}

function parseFlag(name) {
  const idx = argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  const value = argv[idx + 1];
  if (!value || value.startsWith("--")) {
    console.error(`--${name} requires a value`);
    process.exit(1);
  }
  return value;
}

function printUsage() {
  console.log(`Tink webhook endpoint manager

Usage:
  node apps/api/scripts/register-tink-webhook.mjs list
  node apps/api/scripts/register-tink-webhook.mjs create --url <https-url> [--description <text>] [--events <a,b,c>]
  node apps/api/scripts/register-tink-webhook.mjs delete <endpoint-id>

Defaults for create:
  --description  "wise-finance ${apiBase.includes("tink.com") ? "prod" : "dev"}"
  --events       ${DEFAULT_EVENTS.join(",")}
`);
}

async function listEndpoints() {
  const token = await getClientToken("webhook-endpoints");
  const { ok, status, json, text } = await tinkFetch(token, "/events/v2/webhook-endpoints");
  if (!ok) {
    console.error(`list failed ${status}: ${text}`);
    process.exit(1);
  }
  const items = Array.isArray(json) ? json : json?.webhookEndpoints ?? json?.endpoints ?? [];
  if (items.length === 0) {
    console.log("(no webhook endpoints registered)");
    return;
  }
  for (const ep of items) {
    console.log(`- id:           ${ep.id}`);
    console.log(`  url:          ${ep.url}`);
    console.log(`  description:  ${ep.description ?? "(none)"}`);
    console.log(`  enabledEvents:${(ep.enabledEvents ?? []).join(", ")}`);
    if (ep.disabled !== undefined) console.log(`  disabled:     ${ep.disabled}`);
    console.log("");
  }
}

async function createEndpoint() {
  const url = parseFlag("url");
  if (!url) {
    console.error("--url is required for create");
    process.exit(1);
  }
  if (!/^https:\/\//i.test(url)) {
    console.error(`--url must be an https:// URL (got ${url})`);
    process.exit(1);
  }
  const description = parseFlag("description") ?? `wise-finance ${apiBase.includes("tink.com") ? "prod" : "dev"}`;
  const eventsArg = parseFlag("events");
  const enabledEvents = eventsArg ? eventsArg.split(",").map((s) => s.trim()).filter(Boolean) : DEFAULT_EVENTS;

  const token = await getClientToken("webhook-endpoints");
  const { ok, status, json, text } = await tinkFetch(token, "/events/v2/webhook-endpoints", {
    method: "POST",
    body: JSON.stringify({ description, url, enabledEvents })
  });
  if (!ok) {
    console.error(`create failed ${status}: ${text}`);
    process.exit(1);
  }

  console.log("Webhook endpoint created.\n");
  console.log(`  id:            ${json.id}`);
  console.log(`  url:           ${json.url}`);
  console.log(`  description:   ${json.description ?? "(none)"}`);
  console.log(`  enabledEvents: ${(json.enabledEvents ?? []).join(", ")}`);
  console.log("");

  const secret = json.secret ?? json.webhookSecret;
  if (!secret) {
    console.warn("WARNING: response did not include a `secret` field. Full payload:");
    console.warn(JSON.stringify(json, null, 2));
    process.exit(2);
  }

  console.log("==================================================================");
  console.log("  TINK_WEBHOOK_SECRET (shown only once — copy it now):");
  console.log(`  ${secret}`);
  console.log("==================================================================");
  console.log("\nNext steps:");
  console.log("  1. Set TINK_WEBHOOK_SECRET in your Coolify env (mark as Secret).");
  console.log("  2. Set TINK_WEBHOOK_PATH to the path portion of --url (default /integrations/tink/webhook).");
  console.log("  3. Redeploy the api so the verifier picks up the new secret.");
}

async function deleteEndpoint() {
  const id = argv[1];
  if (!id || id.startsWith("--")) {
    console.error("delete requires an endpoint id: register-tink-webhook.mjs delete <id>");
    process.exit(1);
  }
  const token = await getClientToken("webhook-endpoints");
  const { ok, status, text } = await tinkFetch(token, `/events/v2/webhook-endpoints/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
  if (!ok) {
    console.error(`delete failed ${status}: ${text}`);
    process.exit(1);
  }
  console.log(`Deleted webhook endpoint ${id}.`);
}

switch (command) {
  case "list":
    await listEndpoints();
    break;
  case "create":
    await createEndpoint();
    break;
  case "delete":
    await deleteEndpoint();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
}
