import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../src/index.js";
import { testEnv as env } from "./helpers.js";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Tink data proxy", () => {
  it("rejects missing Authorization without calling upstream", async () => {
    const res = await app.request("/tink/data/v2/accounts", {}, env);

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({
      error: "unauthorized",
      message: "Missing Authorization header",
    });
  });

  it("forwards accounts requests with bearer auth", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ accounts: [{ id: "account-1" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const res = await app.request(
      "/tink/data/v2/accounts?include=balances",
      { headers: { Authorization: "Bearer access-token" } },
      env
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accounts: [{ id: "account-1" }] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0]!;
    expect(String(calledUrl)).toBe("https://api.tink.test/data/v2/accounts?include=balances");
    expect(init).toMatchObject({
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer access-token",
      },
    });
  });

  it("forwards transaction window query parameters", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ transactions: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const res = await app.request(
      "/tink/data/v2/transactions?from=2026-01-01&to=2026-05-14",
      { headers: { Authorization: "Bearer access-token" } },
      env
    );

    expect(res.status).toBe(200);
    const [calledUrl] = fetchMock.mock.calls[0]!;
    expect(String(calledUrl)).toBe(
      "https://api.tink.test/data/v2/transactions?from=2026-01-01&to=2026-05-14"
    );
  });

  it("passes through upstream auth failures and content type", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "invalid_token" }), {
        status: 401,
        headers: { "Content-Type": "application/problem+json" },
      })
    );

    const res = await app.request(
      "/tink/data/v2/accounts",
      { headers: { Authorization: "Bearer expired" } },
      env
    );

    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toBe("application/problem+json");
    expect(await res.json()).toEqual({ error: "invalid_token" });
  });

  it("passes through upstream server errors", async () => {
    fetchMock.mockResolvedValueOnce(new Response("upstream down", { status: 500 }));

    const res = await app.request(
      "/tink/data/v2/transactions",
      { headers: { Authorization: "Bearer access-token" } },
      env
    );

    expect(res.status).toBe(500);
    expect(await res.text()).toBe("upstream down");
  });

  it("responds to CORS preflight without upstream calls", async () => {
    const res = await app.request(
      "/tink/data/v2/accounts",
      {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:8090",
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": "Authorization",
        },
      },
      env
    );

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("GET");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not proxy unsupported Tink paths", async () => {
    const res = await app.request(
      "/tink/data/v2/credentials",
      { headers: { Authorization: "Bearer access-token" } },
      env
    );

    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
