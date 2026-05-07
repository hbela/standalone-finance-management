/**
 * Smoke test for the Wise sandbox integration via personal token.
 *
 * Loads WISE_PERSONAL_TOKEN from apps/api/.env(.local) or repo root .env(.local),
 * hits the live Wise sandbox API (api.sandbox.transferwise.tech) directly using
 * dist/wiseClient.js, runs each balance through the normalizer, and prints a
 * concise report. No Convex writes — purely a wire-format guard.
 *
 * Usage:
 *   npm run build -w @wise-finance/api
 *   node apps/api/scripts/smoke-wise-sandbox.mjs
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

if (!process.env.WISE_PERSONAL_TOKEN) {
  console.error("Missing WISE_PERSONAL_TOKEN. Add it to apps/api/.env.local.");
  process.exit(1);
}

process.env.WISE_API_BASE_URL ??= "https://api.sandbox.transferwise.tech";
process.env.WISE_ENVIRONMENT ??= "sandbox";

const { listWiseProfiles, listWiseBalances, listWiseStatement } = await import(
  "../dist/wiseClient.js"
);
const { normalizeWiseAccounts, normalizeWiseTransactions } = await import(
  "../dist/wiseNormalize.js"
);

const accessToken = process.env.WISE_PERSONAL_TOKEN;

console.log(`\nWise sandbox smoke against ${process.env.WISE_API_BASE_URL}`);

const profiles = await listWiseProfiles(accessToken);
console.log(`\n[profiles] ${profiles.length} profile(s)`);
for (const profile of profiles) {
  const label = profile.fullName ?? profile.details?.businessName ?? profile.details?.name ?? profile.id;
  console.log(`  - id=${profile.id} type=${profile.type} ${label}`);
}

const balanceEntries = [];
for (const profile of profiles) {
  try {
    const balances = await listWiseBalances(accessToken, profile.id);
    for (const balance of balances) {
      balanceEntries.push({ profile, balance });
    }
    console.log(`\n[balances:${profile.id}] ${balances.length} balance(s)`);
    for (const balance of balances) {
      console.log(
        `  - id=${balance.id} ${balance.amount?.currency ?? balance.currency} ` +
          `value=${balance.amount?.value ?? "?"} cash=${balance.cashAmount?.value ?? "—"} ` +
          `name=${balance.name ?? ""}`
      );
    }
  } catch (error) {
    console.error(`[balances:${profile.id}] failed:`, error instanceof Error ? error.message : error);
  }
}

const accountSync = normalizeWiseAccounts(balanceEntries);
console.log(
  `\n[normalizeWiseAccounts] accounts=${accountSync.accounts.length} skipped=${accountSync.skippedCount}`
);
for (const account of accountSync.accounts) {
  console.log(
    `  - providerAccountId=${account.providerAccountId} ${account.currency} ` +
      `balance=${account.currentBalance} holder=${account.holderName ?? "?"}`
  );
}
if (Object.keys(accountSync.skipReasons).length > 0) {
  console.log(`  skipReasons:`, accountSync.skipReasons);
}

const intervalEnd = new Date().toISOString();
const intervalStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
const fxSnapshot = {
  base: "EUR",
  rates: { EUR: 1, HUF: 1 / 0.00254, USD: 1 / 0.93, GBP: 1 / 1.16 },
  source: "static",
  fetchedAt: Date.now()
};

const statements = [];
for (const entry of balanceEntries) {
  try {
    const statement = await listWiseStatement(accessToken, {
      profileId: entry.profile.id,
      balanceId: entry.balance.id,
      currency: entry.balance.amount?.currency ?? entry.balance.currency,
      intervalStart,
      intervalEnd
    });
    statements.push({
      profile: entry.profile,
      balance: entry.balance,
      transactions: statement.transactions ?? []
    });
    console.log(
      `\n[statement:${entry.profile.id}/${entry.balance.id}] ` +
        `${statement.transactions?.length ?? 0} transaction(s)`
    );
  } catch (error) {
    console.error(
      `[statement:${entry.profile.id}/${entry.balance.id}] failed:`,
      error instanceof Error ? error.message : error
    );
  }
}

const transactionSync = normalizeWiseTransactions(statements, fxSnapshot);
console.log(
  `\n[normalizeWiseTransactions] transactions=${transactionSync.transactions.length} skipped=${transactionSync.skippedCount}`
);
if (Object.keys(transactionSync.skipReasons).length > 0) {
  console.log(`  skipReasons:`, transactionSync.skipReasons);
}
for (const tx of transactionSync.transactions.slice(0, 5)) {
  console.log(
    `  - ${tx.providerTransactionId} ${tx.currency} ${tx.amount} type=${tx.type} ` +
      `desc="${tx.description}" merchant=${tx.merchant ?? "—"}`
  );
}
if (transactionSync.transactions.length > 5) {
  console.log(`  … ${transactionSync.transactions.length - 5} more`);
}

console.log(`\nSmoke checks completed.`);
