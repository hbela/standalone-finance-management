import {
  listTinkAccounts,
  listTinkTransactions,
  parseTinkAmountValue,
} from "./tinkMobileClient";

const originalEnv = process.env;
const originalFetch = global.fetch;

beforeEach(() => {
  jest.resetModules();
  process.env.EXPO_PUBLIC_TINK_BRIDGE_URL = "https://bridge.example.com/";
});

afterEach(() => {
  process.env.EXPO_PUBLIC_TINK_BRIDGE_URL = originalEnv.EXPO_PUBLIC_TINK_BRIDGE_URL;
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

describe("Tink mobile client", () => {
  test("trims bridge URL and validates account response shape", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ accounts: [{ id: "account-1" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(listTinkAccounts("access-token")).resolves.toEqual([{ id: "account-1" }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://bridge.example.com/tink/data/v2/accounts",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Accept: "application/json",
          Authorization: "Bearer access-token",
        }),
      })
    );
  });

  test("throws when accounts response is not an array", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ accounts: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ) as unknown as typeof fetch;

    await expect(listTinkAccounts("access-token")).rejects.toThrow(/invalid response/);
  });

  test("adds transaction window query params", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ transactions: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    await listTinkTransactions("access-token", { from: "2026-01-01", to: "2026-05-14" });

    const [calledUrl] = fetchMock.mock.calls[0];
    const url = new URL(calledUrl as string);
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://bridge.example.com/tink/data/v2/transactions"
    );
    expect(url.searchParams.get("from")).toBe("2026-01-01");
    expect(url.searchParams.get("to")).toBe("2026-05-14");
  });

  test.each([
    [{ error_description: "expired consent" }, "expired consent"],
    [{ errorMessage: "bad bearer" }, "bad bearer"],
    [{ message: "upstream unavailable" }, "upstream unavailable"],
  ])("extracts upstream error message from %p", async (payload, expected) => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    ) as unknown as typeof fetch;

    await expect(listTinkAccounts("access-token")).rejects.toThrow(expected);
  });

  test("falls back to status message for non-JSON errors", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response("gateway timeout", { status: 504 })
    ) as unknown as typeof fetch;

    await expect(listTinkAccounts("access-token")).rejects.toThrow(/504/);
  });

  test("requires bridge URL for sync calls", async () => {
    process.env.EXPO_PUBLIC_TINK_BRIDGE_URL = "";
    await expect(listTinkAccounts("access-token")).rejects.toThrow(/EXPO_PUBLIC_TINK_BRIDGE_URL/);
  });
});

describe("parseTinkAmountValue", () => {
  test.each([
    [42, 42],
    ["42.5", 42.5],
    [{ value: { unscaledValue: "12345", scale: "2" } }, 123.45],
    [{ amount: { value: { unscaledValue: -999, scale: 2 } } }, -9.99],
  ])("parses %p", (input, expected) => {
    expect(parseTinkAmountValue(input as never)).toBe(expected);
  });

  test.each([Number.NaN, "nope", { value: { unscaledValue: "x", scale: 2 } }, undefined])(
    "returns null for invalid amount %p",
    (input) => {
      expect(parseTinkAmountValue(input as never)).toBeNull();
    }
  );
});
