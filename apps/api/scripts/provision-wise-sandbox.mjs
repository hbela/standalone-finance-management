/**
 * One-shot Wise sandbox provisioner.
 *
 * The Wise sandbox UI does not expose balance creation; everything is API-driven.
 * This script lists your profiles, opens a STANDARD balance in the requested
 * currency if one doesn't already exist, tops it up via the sandbox simulation
 * endpoint, and prints the resulting state. Idempotent — safe to re-run.
 *
 * Usage:
 *   node apps/api/scripts/provision-wise-sandbox.mjs            # default EUR + USD, 1000 each
 *   node apps/api/scripts/provision-wise-sandbox.mjs EUR        # only EUR
 *   node apps/api/scripts/provision-wise-sandbox.mjs EUR=2500 GBP=750
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
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

const token = process.env.WISE_PERSONAL_TOKEN;
if (!token) {
  console.error("Missing WISE_PERSONAL_TOKEN. Add it to apps/api/.env.local.");
  process.exit(1);
}

const apiBase = process.env.WISE_API_BASE_URL ?? "https://api.sandbox.transferwise.tech";

const argRequests = process.argv.slice(2);
const requests = (argRequests.length > 0 ? argRequests : ["EUR=1000", "USD=1000"]).map((spec) => {
  const [currency, amount] = spec.includes("=") ? spec.split("=") : [spec, "1000"];
  return { currency: currency.toUpperCase(), amount: Number(amount) };
});

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
  "Content-Type": "application/json"
};

async function call(method, path, body, extraHeaders = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: { ...headers, ...extraHeaders },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { status: response.status, ok: response.ok, payload };
}

console.log(`Provisioning against ${apiBase}\n`);

const profilesResult = await call("GET", "/v2/profiles");
if (!profilesResult.ok || !Array.isArray(profilesResult.payload)) {
  console.error("Could not list profiles:", profilesResult);
  process.exit(1);
}
const profiles = profilesResult.payload;
console.log(`[profiles] ${profiles.length} found`);

for (const profile of profiles) {
  const label = profile.fullName ?? profile.details?.businessName ?? profile.details?.name ?? profile.id;
  console.log(`\n=== profile id=${profile.id} type=${profile.type} ${label}`);

  const existingResult = await call("GET", `/v4/profiles/${profile.id}/balances?types=STANDARD,SAVINGS`);
  const existing = Array.isArray(existingResult.payload) ? existingResult.payload : [];
  console.log(`  existing balances: ${existing.length}`);
  for (const balance of existing) {
    console.log(`    - id=${balance.id} ${balance.currency} value=${balance.amount?.value ?? "?"}`);
  }
  const existingByCurrency = new Map(existing.map((balance) => [balance.currency, balance]));

  for (const request of requests) {
    let balance = existingByCurrency.get(request.currency);

    if (!balance) {
      console.log(`  opening ${request.currency} balance…`);
      const opened = await call(
        "POST",
        `/v4/profiles/${profile.id}/balances`,
        { currency: request.currency, type: "STANDARD" },
        { "X-idempotence-uuid": randomUUID() }
      );
      if (!opened.ok) {
        console.warn(`    open failed (${opened.status}):`, JSON.stringify(opened.payload));
        continue;
      }
      balance = opened.payload;
      console.log(`    opened id=${balance.id} ${balance.currency}`);
    }

    if (!balance || !balance.id) continue;

    console.log(`  topping up ${request.currency} ${request.amount}…`);
    const topup = await call("POST", `/v1/simulation/balance/${balance.id}/topup`, {
      amount: { value: request.amount, currency: request.currency }
    });
    if (topup.ok) {
      console.log(`    top-up ok`);
    } else {
      const altBody = { amount: request.amount, currency: request.currency };
      const altTopup = await call("POST", `/v1/simulation/balance/${balance.id}/topup`, altBody);
      if (altTopup.ok) {
        console.log(`    top-up ok (legacy body shape)`);
      } else {
        console.warn(`    top-up failed (${topup.status}):`, JSON.stringify(topup.payload));
        console.warn(`      legacy body also failed (${altTopup.status}):`, JSON.stringify(altTopup.payload));
      }
    }
  }

  const afterResult = await call("GET", `/v4/profiles/${profile.id}/balances?types=STANDARD,SAVINGS`);
  const after = Array.isArray(afterResult.payload) ? afterResult.payload : [];
  console.log(`  balances after provisioning: ${after.length}`);
  for (const balance of after) {
    console.log(`    - id=${balance.id} ${balance.currency} value=${balance.amount?.value ?? "?"}`);
  }
}

console.log("\nDone. Re-run smoke-wise-sandbox.mjs to see the normalizer pick up the new data.");
