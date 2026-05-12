import {
  buildStaticSnapshot,
  fetchLiveRates,
  FX_PROVIDER_URL,
  normalizeFxCurrency,
  parseRates,
  toBaseCurrencyAmount,
} from "./fxRates";

const NOW = Date.parse("2026-05-12T00:00:00.000Z");

describe("normalizeFxCurrency", () => {
  test("accepts HUF/USD/GBP as supported, everything else folds to EUR", () => {
    expect(normalizeFxCurrency("HUF")).toBe("HUF");
    expect(normalizeFxCurrency("usd")).toBe("USD");
    expect(normalizeFxCurrency("GBP")).toBe("GBP");
    expect(normalizeFxCurrency("EUR")).toBe("EUR");
    expect(normalizeFxCurrency("SEK")).toBe("EUR");
    expect(normalizeFxCurrency("")).toBe("EUR");
  });
});

describe("buildStaticSnapshot", () => {
  test("EUR base uses the canonical EUR-per-X table", () => {
    const snapshot = buildStaticSnapshot("EUR", NOW);
    expect(snapshot.base).toBe("EUR");
    expect(snapshot.source).toBe("static");
    expect(snapshot.fetchedAt).toBe(NOW);
    expect(snapshot.rates.EUR).toBe(1);
    expect(snapshot.rates.HUF).toBeGreaterThan(300);
    expect(snapshot.rates.USD).toBeGreaterThan(0.5);
    expect(snapshot.rates.GBP).toBeGreaterThan(0.5);
  });

  test("non-EUR base re-pivots rates so target currency self-rate is 1", () => {
    const snapshot = buildStaticSnapshot("USD", NOW);
    expect(snapshot.base).toBe("USD");
    expect(snapshot.rates.USD).toBe(1);
    // Approximate sanity check: HUF/USD should be > HUF/EUR since USD < EUR
    expect(snapshot.rates.HUF).toBeGreaterThan(300);
    expect(snapshot.rates.EUR).toBeGreaterThan(0.5);
  });
});

describe("parseRates", () => {
  test("returns the parsed rates when JSON is well-formed", () => {
    const json = JSON.stringify({ EUR: 1, HUF: 400, USD: 1.08, GBP: 0.86 });
    const rates = parseRates(json, "EUR");
    expect(rates.HUF).toBe(400);
    expect(rates.USD).toBe(1.08);
  });

  test("substitutes static values for missing or invalid rates per code", () => {
    const json = JSON.stringify({ EUR: 1, HUF: "nope", USD: -1, GBP: 0.86 });
    const rates = parseRates(json, "EUR");
    expect(rates.GBP).toBe(0.86);
    // HUF and USD are invalid -> static fallback used (any positive number is fine)
    expect(rates.HUF).toBeGreaterThan(0);
    expect(rates.USD).toBeGreaterThan(0);
  });

  test("falls back to static rates entirely when JSON parse fails", () => {
    const rates = parseRates("not json", "EUR");
    expect(rates.EUR).toBe(1);
    expect(rates.HUF).toBeGreaterThan(0);
  });
});

describe("toBaseCurrencyAmount", () => {
  test("identity when amount currency matches snapshot base", () => {
    const snapshot = buildStaticSnapshot("EUR", NOW);
    expect(toBaseCurrencyAmount(100, "EUR", snapshot)).toBe(100);
  });

  test("divides by the target rate when converting from a non-base currency", () => {
    const snapshot = buildStaticSnapshot("EUR", NOW);
    // 393.7 HUF per EUR -> 393.7 HUF = 1 EUR
    expect(toBaseCurrencyAmount(393.7, "HUF", snapshot)).toBeCloseTo(1, 6);
  });

  test("leaves amount untouched when target rate is missing/invalid", () => {
    const snapshot = buildStaticSnapshot("EUR", NOW);
    // SEK normalises to EUR (which is the base) -> identity
    expect(toBaseCurrencyAmount(100, "SEK", snapshot)).toBe(100);
  });
});

describe("fetchLiveRates", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("calls the configured provider with from + to query params", async () => {
    const mockFetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ rates: { HUF: 400, USD: 1.08, GBP: 0.86 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    global.fetch = mockFetch as unknown as typeof fetch;

    const snapshot = await fetchLiveRates("EUR", NOW);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl] = mockFetch.mock.calls[0];
    expect(typeof calledUrl).toBe("string");
    const url = new URL(calledUrl as string);
    expect(`${url.origin}${url.pathname}`).toBe(FX_PROVIDER_URL);
    expect(url.searchParams.get("from")).toBe("EUR");
    expect(url.searchParams.get("to")?.split(",").sort()).toEqual(["GBP", "HUF", "USD"]);
    expect(snapshot.source).toBe("live");
    expect(snapshot.base).toBe("EUR");
    expect(snapshot.rates.HUF).toBe(400);
    expect(snapshot.rates.EUR).toBe(1);
    expect(snapshot.fetchedAt).toBe(NOW);
  });

  test("throws when the provider responds non-OK", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response("upstream down", { status: 503 })
    ) as unknown as typeof fetch;
    await expect(fetchLiveRates("EUR", NOW)).rejects.toThrow(/503/);
  });

  test("throws when the provider returns a payload without rates", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ wrong: "shape" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ) as unknown as typeof fetch;
    await expect(fetchLiveRates("EUR", NOW)).rejects.toThrow(/malformed/);
  });

  test("keeps the static fallback for any rate the provider omits", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ rates: { HUF: 400 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ) as unknown as typeof fetch;

    const snapshot = await fetchLiveRates("EUR", NOW);
    expect(snapshot.rates.HUF).toBe(400);
    // USD/GBP fall back to the static table (positive, finite)
    expect(snapshot.rates.USD).toBeGreaterThan(0);
    expect(snapshot.rates.GBP).toBeGreaterThan(0);
  });
});
