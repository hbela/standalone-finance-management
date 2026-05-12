import type { MirrorDatabase } from "../db/client";
import { fxRatesRepo } from "../db/repositories";

export type FxBaseCurrency = "HUF" | "EUR" | "USD" | "GBP";
export type FxRates = Record<FxBaseCurrency, number>;
export type FxSource = "live" | "cached" | "static";

export type FxSnapshot = {
  base: FxBaseCurrency;
  rates: FxRates;
  source: FxSource;
  fetchedAt: number;
};

export const FX_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const FX_PROVIDER_URL = "https://api.frankfurter.app/latest";

const STATIC_RATES_PER_EUR: FxRates = {
  EUR: 1,
  HUF: 393.7,
  USD: 1.075,
  GBP: 0.862,
};

/**
 * Returns an FX snapshot for the given base currency. Uses the SQLite cache when
 * it's < 24h old; otherwise tries Frankfurter and caches the result. Falls back
 * to a stale cache entry or static rates if the live fetch fails — sync should
 * keep working even when Frankfurter is unreachable.
 */
export async function ensureFxSnapshot(
  db: MirrorDatabase,
  base: string,
  now: number
): Promise<FxSnapshot> {
  const normalizedBase = normalizeFxCurrency(base);
  const existing = await fxRatesRepo.byBaseCurrency(db, normalizedBase);
  if (existing && now - existing.fetchedAt < FX_CACHE_TTL_MS) {
    return {
      base: normalizedBase,
      rates: parseRates(existing.ratesJson, normalizedBase),
      source: "cached",
      fetchedAt: existing.fetchedAt,
    };
  }

  try {
    const live = await fetchLiveRates(normalizedBase, now);
    await fxRatesRepo.upsert(db, [
      {
        baseCurrency: live.base,
        ratesJson: JSON.stringify(live.rates),
        source: "live",
        fetchedAt: live.fetchedAt,
        updatedAt: now,
      },
    ]);
    return live;
  } catch {
    if (existing) {
      return {
        base: normalizedBase,
        rates: parseRates(existing.ratesJson, normalizedBase),
        source: "cached",
        fetchedAt: existing.fetchedAt,
      };
    }
    return buildStaticSnapshot(normalizedBase, now);
  }
}

export function toBaseCurrencyAmount(
  amount: number,
  currency: string,
  snapshot: FxSnapshot
): number {
  const normalizedCurrency = normalizeFxCurrency(currency);
  if (normalizedCurrency === snapshot.base) return amount;
  const targetPerBase = snapshot.rates[normalizedCurrency];
  return targetPerBase && Number.isFinite(targetPerBase) ? amount / targetPerBase : amount;
}

export async function fetchLiveRates(
  base: FxBaseCurrency,
  fetchedAt: number
): Promise<FxSnapshot> {
  const symbols = (Object.keys(STATIC_RATES_PER_EUR) as FxBaseCurrency[])
    .filter((code) => code !== base)
    .join(",");
  const url = new URL(FX_PROVIDER_URL);
  url.searchParams.set("from", base);
  url.searchParams.set("to", symbols);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`fx provider responded with ${response.status}`);
  }

  const payload = (await response.json()) as { rates?: Record<string, number> } | null;
  if (!payload || !payload.rates || typeof payload.rates !== "object") {
    throw new Error("fx provider returned malformed payload");
  }

  const rates: FxRates = { ...STATIC_RATES_PER_EUR };
  rates[base] = 1;
  for (const code of Object.keys(STATIC_RATES_PER_EUR) as FxBaseCurrency[]) {
    if (code === base) continue;
    const value = payload.rates[code];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      rates[code] = value;
    }
  }

  return { base, rates, source: "live", fetchedAt };
}

export function buildStaticSnapshot(base: FxBaseCurrency, fetchedAt: number): FxSnapshot {
  if (base === "EUR") {
    return { base, rates: { ...STATIC_RATES_PER_EUR }, source: "static", fetchedAt };
  }

  const eurPerBaseUnit = 1 / STATIC_RATES_PER_EUR[base];
  const rates: FxRates = { EUR: eurPerBaseUnit, HUF: 0, USD: 0, GBP: 0 };
  for (const code of Object.keys(STATIC_RATES_PER_EUR) as FxBaseCurrency[]) {
    rates[code] =
      code === base
        ? 1
        : code === "EUR"
          ? eurPerBaseUnit
          : STATIC_RATES_PER_EUR[code] * eurPerBaseUnit;
  }
  return { base, rates, source: "static", fetchedAt };
}

export function normalizeFxCurrency(value: string): FxBaseCurrency {
  const currency = value.toUpperCase();
  if (currency === "HUF" || currency === "USD" || currency === "GBP") return currency;
  return "EUR";
}

export function parseRates(value: string, base: FxBaseCurrency): FxRates {
  try {
    const parsed = JSON.parse(value) as Partial<Record<FxBaseCurrency, unknown>>;
    return {
      EUR: readRate(parsed.EUR, base, "EUR"),
      HUF: readRate(parsed.HUF, base, "HUF"),
      USD: readRate(parsed.USD, base, "USD"),
      GBP: readRate(parsed.GBP, base, "GBP"),
    };
  } catch {
    return buildStaticSnapshot(base, Date.now()).rates;
  }
}

function readRate(value: unknown, base: FxBaseCurrency, code: FxBaseCurrency): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : buildStaticSnapshot(base, Date.now()).rates[code];
}
