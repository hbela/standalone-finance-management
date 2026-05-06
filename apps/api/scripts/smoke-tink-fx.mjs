/**
 * Smoke test for live FX rates with cache + static fallback.
 *
 * Stubs globalThis.fetch to:
 *   - return Frankfurter-shaped rate payloads for the FX provider
 *   - simulate provider errors to exercise static fallback
 *
 * Verifies:
 *   - first call fetches live, second call within TTL hits cache
 *   - toBaseCurrencyAmount converts correctly for HUF -> EUR
 *   - same currency as base maps to identity
 *   - provider error falls back to static rates
 *   - clearFxCache resets state
 */
import assert from "node:assert/strict";
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

const realFetch = globalThis.fetch;
let fxFetchCount = 0;
let fxBehavior = "ok";

globalThis.fetch = async (input, init) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  if (url.includes("frankfurter") || url.includes("FX_PROVIDER")) {
    fxFetchCount += 1;
    if (fxBehavior === "error") {
      return new Response("upstream down", { status: 502 });
    }
    return new Response(
      JSON.stringify({
        amount: 1,
        base: "EUR",
        date: "2026-05-06",
        rates: { HUF: 400, USD: 1.1, GBP: 0.85 }
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }
  return realFetch(input, init);
};

const { getFxSnapshot, toBaseCurrencyAmount, clearFxCache } = await import("../dist/fxRates.js");

const log = { info: () => undefined, warn: () => undefined };

async function scenarioLiveRatesAndCache() {
  clearFxCache();
  fxFetchCount = 0;
  fxBehavior = "ok";

  const first = await getFxSnapshot("EUR", log);
  assert.equal(first.source, "live");
  assert.equal(first.base, "EUR");
  assert.equal(fxFetchCount, 1, "first call hits provider");
  assert.equal(first.rates.HUF, 400);
  assert.equal(first.rates.USD, 1.1);

  const second = await getFxSnapshot("EUR", log);
  assert.equal(fxFetchCount, 1, "second call within TTL hits cache");
  assert.equal(second.fetchedAt, first.fetchedAt, "same snapshot returned");
}

async function scenarioConversion() {
  clearFxCache();
  fxFetchCount = 0;
  fxBehavior = "ok";

  const snapshot = await getFxSnapshot("EUR", log);
  const fromHuf = toBaseCurrencyAmount(-10000, "HUF", snapshot);
  assert.equal(Math.round(fromHuf * 100) / 100, -25, "10000 HUF / 400 = 25 EUR");

  const fromEur = toBaseCurrencyAmount(12.99, "EUR", snapshot);
  assert.equal(fromEur, 12.99, "same currency as base is identity");

  const fromUsd = toBaseCurrencyAmount(110, "USD", snapshot);
  assert.equal(Math.round(fromUsd * 100) / 100, 100, "110 USD / 1.1 = 100 EUR");
}

async function scenarioStaticFallback() {
  clearFxCache();
  fxFetchCount = 0;
  fxBehavior = "error";

  const snapshot = await getFxSnapshot("EUR", log);
  assert.equal(snapshot.source, "static", "fallback when provider fails");
  assert.equal(snapshot.base, "EUR");
  assert.ok(snapshot.rates.HUF > 0, "static rates populated");
  assert.equal(snapshot.rates.EUR, 1);
}

async function scenarioNonEurBase() {
  clearFxCache();
  fxFetchCount = 0;
  fxBehavior = "error";

  const snapshot = await getFxSnapshot("HUF", log);
  assert.equal(snapshot.base, "HUF");
  assert.equal(snapshot.rates.HUF, 1);
  const fromEur = toBaseCurrencyAmount(1, "EUR", snapshot);
  assert.ok(fromEur > 1, "HUF base means 1 EUR is many HUF");
}

await scenarioLiveRatesAndCache();
await scenarioConversion();
await scenarioStaticFallback();
await scenarioNonEurBase();

console.log("FX rates smoke checks passed:");
console.log(" - live fetch + cache (1 call within TTL)");
console.log(" - HUF/EUR/USD conversion math correct");
console.log(" - static fallback on provider error");
console.log(" - HUF base direction inverts correctly");
