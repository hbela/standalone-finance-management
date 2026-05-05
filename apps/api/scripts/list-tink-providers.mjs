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

if (!clientId || !clientSecret) {
  console.error("Missing TINK_CLIENT_ID or TINK_CLIENT_SECRET");
  process.exit(1);
}

const tokenRes = await fetch(`${apiBase}/api/v1/oauth/token`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "providers:read"
  })
});

const tokenJson = await tokenRes.json();
if (!tokenRes.ok) {
  console.error("Token error:", tokenJson);
  process.exit(1);
}

const accessToken = tokenJson.access_token;

const url = new URL(`${apiBase}/api/v1/providers/${market}`);
url.searchParams.set("includeTestProviders", "true");
url.searchParams.set("excludeNonTestProviders", "false");

const provRes = await fetch(url, {
  headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }
});
const provJson = await provRes.json();
if (!provRes.ok) {
  console.error("Providers error:", provJson);
  process.exit(1);
}

const providers = (provJson.providers ?? []).map((p) => ({
  name: p.name,
  displayName: p.displayName,
  market: p.market,
  capabilities: p.capabilities,
  authenticationFlow: p.authenticationFlow,
  status: p.status,
  accessType: p.accessType,
  type: p.type,
  fields: Array.isArray(p.fields) ? p.fields.map((f) => f.name) : undefined
}));

const testLooking = providers.filter(
  (p) =>
    /test|demo|sandbox/i.test(p.name ?? "") ||
    /test|demo|sandbox/i.test(p.displayName ?? "")
);

console.log(`Total providers for ${market}:`, providers.length);
console.log("\nTest-looking providers:");
console.dir(testLooking, { depth: null });

console.log("\nAll provider names (full list):");
for (const p of providers) {
  console.log(`  ${p.name}  —  ${p.displayName}  [${p.status ?? "?"}]`);
}
