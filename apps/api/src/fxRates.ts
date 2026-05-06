import { config } from "./config.js";

export type FxBaseCurrency = "HUF" | "EUR" | "USD" | "GBP";
export type FxRates = Record<FxBaseCurrency, number>;

export type FxSnapshot = {
  base: FxBaseCurrency;
  rates: FxRates;
  source: "live" | "static";
  fetchedAt: number;
};

const STATIC_RATES_PER_EUR: FxRates = {
  EUR: 1,
  HUF: 393.7,
  USD: 1.075,
  GBP: 0.862
};

const cache = new Map<FxBaseCurrency, FxSnapshot>();

type FxLogger = {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
};

export async function getFxSnapshot(
  base: FxBaseCurrency,
  log?: FxLogger
): Promise<FxSnapshot> {
  const cached = cache.get(base);
  if (cached && Date.now() - cached.fetchedAt < config.fxCacheTtlMs) {
    return cached;
  }

  try {
    const live = await fetchLiveRates(base);
    cache.set(base, live);
    return live;
  } catch (error) {
    log?.warn(
      {
        provider: "fx",
        base,
        errorMessage: error instanceof Error ? error.message : "fx fetch failed"
      },
      "fx live fetch failed, falling back to static rates"
    );

    const fallback = buildStaticSnapshot(base);
    cache.set(base, fallback);
    return fallback;
  }
}

export function toBaseCurrencyAmount(
  amount: number,
  currency: FxBaseCurrency,
  snapshot: FxSnapshot
) {
  if (currency === snapshot.base) {
    return amount;
  }

  const targetPerBase = snapshot.rates[currency];
  if (!targetPerBase || !Number.isFinite(targetPerBase)) {
    return amount;
  }

  return amount / targetPerBase;
}

export function clearFxCache() {
  cache.clear();
}

async function fetchLiveRates(base: FxBaseCurrency): Promise<FxSnapshot> {
  const symbols = (Object.keys(STATIC_RATES_PER_EUR) as FxBaseCurrency[])
    .filter((code) => code !== base)
    .join(",");
  const url = new URL(config.fxProviderUrl);
  url.searchParams.set("from", base);
  url.searchParams.set("to", symbols);

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`fx provider responded with ${response.status}`);
  }

  const payload = (await response.json()) as { rates?: Record<string, number> } | null;
  const rawRates = payload?.rates;
  if (!rawRates || typeof rawRates !== "object") {
    throw new Error("fx provider returned malformed payload");
  }

  const rates: FxRates = { ...STATIC_RATES_PER_EUR };
  rates[base] = 1;
  for (const code of Object.keys(STATIC_RATES_PER_EUR) as FxBaseCurrency[]) {
    if (code === base) continue;
    const value = rawRates[code];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      rates[code] = value;
    }
  }

  return {
    base,
    rates,
    source: "live",
    fetchedAt: Date.now()
  };
}

function buildStaticSnapshot(base: FxBaseCurrency): FxSnapshot {
  if (base === "EUR") {
    return {
      base,
      rates: { ...STATIC_RATES_PER_EUR },
      source: "static",
      fetchedAt: Date.now()
    };
  }

  const eurPerBaseUnit = 1 / STATIC_RATES_PER_EUR[base];
  const rates: FxRates = { EUR: eurPerBaseUnit, HUF: 0, USD: 0, GBP: 0 };
  for (const code of Object.keys(STATIC_RATES_PER_EUR) as FxBaseCurrency[]) {
    if (code === base) {
      rates[code] = 1;
    } else if (code === "EUR") {
      rates[code] = eurPerBaseUnit;
    } else {
      rates[code] = STATIC_RATES_PER_EUR[code] * eurPerBaseUnit;
    }
  }

  return {
    base,
    rates,
    source: "static",
    fetchedAt: Date.now()
  };
}
