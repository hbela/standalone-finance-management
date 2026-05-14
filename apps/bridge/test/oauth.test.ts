import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../src/index.js";
import type { Env } from "../src/env.js";
import { signAsDevice, testEnv as env, tokenResponse } from "./helpers.js";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /health", () => {
  it("returns ok", async () => {
    const res = await app.request("/health", {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});

describe("GET /oauth/tink/callback", () => {
  it("redirects to standalone-finance:// deep link with tokens on success", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify(tokenResponse()),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const res = await app.request(
      "/oauth/tink/callback?code=abc&state=state-123",
      { redirect: "manual" },
      env
    );

    expect(res.status).toBe(302);
    const location = res.headers.get("location");
    expect(location).not.toBeNull();
    expect(location!.startsWith("standalone-finance://oauth/tink#")).toBe(true);
    const fragment = new URLSearchParams(location!.split("#")[1]);
    expect(fragment.get("state")).toBe("state-123");
    expect(fragment.get("access_token")).toBe("tink-access");
    expect(fragment.get("refresh_token")).toBe("tink-refresh");
    expect(fragment.get("expires_in")).toBe("7200");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0]!;
    expect(String(calledUrl)).toBe("https://api.tink.test/api/v1/oauth/token");
    expect(init.method).toBe("POST");
    const body = init.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("abc");
    expect(body.get("client_id")).toBe("tink-client-id");
    expect(body.get("client_secret")).toBe("tink-client-secret");
    expect(body.get("redirect_uri")).toBe("https://bridge.example.com/oauth/tink/callback");
  });

  it("redirects to localhost web callback when state carries a dev web return URL", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify(tokenResponse({ expires_in: undefined, token_type: undefined, scope: undefined })),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const payload = Buffer.from(
      JSON.stringify({ web_redirect_uri: "http://localhost:8091/oauth/tink" })
    ).toString("base64url");
    const state = `state-123.${payload}`;

    const res = await app.request(
      `/oauth/tink/callback?code=abc&state=${encodeURIComponent(state)}`,
      { redirect: "manual" },
      env
    );

    expect(res.status).toBe(302);
    const location = res.headers.get("location");
    expect(location).not.toBeNull();
    expect(location!.startsWith("http://localhost:8091/oauth/tink#")).toBe(true);
    const fragment = new URLSearchParams(location!.split("#")[1]);
    expect(fragment.get("state")).toBe(state);
    expect(fragment.get("access_token")).toBe("tink-access");
    expect(fragment.get("refresh_token")).toBe("tink-refresh");
  });

  it("redirects with error fragment when Tink returns 400", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "invalid_grant", error_description: "code expired" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    );

    const res = await app.request(
      "/oauth/tink/callback?code=stale&state=s",
      { redirect: "manual" },
      env
    );

    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    const fragment = new URLSearchParams(location.split("#")[1]);
    expect(fragment.get("state")).toBe("s");
    expect(fragment.get("error")).toBe("invalid_grant");
    expect(fragment.get("error_description")).toBe("code expired");
  });

  it("redirects with error when the provider returns an OAuth error in the redirect", async () => {
    const res = await app.request(
      "/oauth/tink/callback?error=access_denied&error_description=cancelled&state=s",
      { redirect: "manual" },
      env
    );

    expect(res.status).toBe(302);
    expect(fetchMock).not.toHaveBeenCalled();
    const fragment = new URLSearchParams(res.headers.get("location")!.split("#")[1]);
    expect(fragment.get("error")).toBe("access_denied");
    expect(fragment.get("error_description")).toBe("cancelled");
  });

  it("redirects with invalid_request when code or state is missing", async () => {
    const res = await app.request("/oauth/tink/callback?state=s", { redirect: "manual" }, env);
    expect(res.status).toBe(302);
    expect(fetchMock).not.toHaveBeenCalled();
    const fragment = new URLSearchParams(res.headers.get("location")!.split("#")[1]);
    expect(fragment.get("error")).toBe("invalid_request");
  });

  it("redirects with exchange_failed when Tink returns malformed success JSON", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ refresh_token: "orphan-refresh" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const res = await app.request(
      "/oauth/tink/callback?code=abc&state=s",
      { redirect: "manual" },
      env
    );

    expect(res.status).toBe(302);
    const fragment = new URLSearchParams(res.headers.get("location")!.split("#")[1]);
    expect(fragment.get("error")).toBe("exchange_failed");
    expect(fragment.get("error_description")).toBe("Tink returned invalid token response");
    expect(fragment.has("refresh_token")).toBe(false);
  });

  it("redirects without refresh_token when Tink omits the optional field", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "access-only" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const res = await app.request(
      "/oauth/tink/callback?code=abc&state=s",
      { redirect: "manual" },
      env
    );

    const fragment = new URLSearchParams(res.headers.get("location")!.split("#")[1]);
    expect(fragment.get("access_token")).toBe("access-only");
    expect(fragment.has("refresh_token")).toBe(false);
  });

  it("redirects with exchange_failed when the token exchange throws", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network offline"));

    const res = await app.request(
      "/oauth/tink/callback?code=abc&state=s",
      { redirect: "manual" },
      env
    );

    const fragment = new URLSearchParams(res.headers.get("location")!.split("#")[1]);
    expect(fragment.get("error")).toBe("exchange_failed");
    expect(fragment.get("error_description")).toBe("network offline");
  });

  it("redirects with provider_not_configured when Tink env is missing", async () => {
    const missingEnv: Env = {
      ...env,
      TINK_CLIENT_ID: undefined as unknown as string,
      TINK_CLIENT_SECRET: undefined as unknown as string,
      TINK_REDIRECT_URI: undefined as unknown as string,
    };

    const res = await app.request(
      "/oauth/tink/callback?code=abc&state=s",
      { redirect: "manual" },
      missingEnv
    );

    expect(res.status).toBe(302);
    expect(fetchMock).not.toHaveBeenCalled();
    const fragment = new URLSearchParams(res.headers.get("location")!.split("#")[1]);
    expect(fragment.get("error")).toBe("provider_not_configured");
    expect(fragment.get("error_description")).toBe(
      "Tink OAuth is not configured for this bridge deployment"
    );
  });
});

describe("POST /oauth/tink/refresh", () => {
  it("returns refreshed tokens for a validly signed request", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_in: 3600,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const body = JSON.stringify({ refresh_token: "old-refresh" });
    const headers = await signAsDevice({
      method: "POST",
      path: "/oauth/tink/refresh",
      body,
      timestamp: Math.floor(Date.now() / 1000),
    });

    const res = await app.request(
      "/oauth/tink/refresh",
      {
        method: "POST",
        body,
        headers: { "Content-Type": "application/json", ...headers },
      },
      env
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_in: 3600,
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const sentBody = init.body as URLSearchParams;
    expect(sentBody.get("grant_type")).toBe("refresh_token");
    expect(sentBody.get("refresh_token")).toBe("old-refresh");
  });

  it("rejects an unsigned refresh request with 401", async () => {
    const res = await app.request(
      "/oauth/tink/refresh",
      {
        method: "POST",
        body: JSON.stringify({ refresh_token: "abc" }),
        headers: { "Content-Type": "application/json" },
      },
      env
    );

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ error: "unauthorized" });
  });

  it("rejects when the body is missing refresh_token", async () => {
    const body = JSON.stringify({});
    const headers = await signAsDevice({
      method: "POST",
      path: "/oauth/tink/refresh",
      body,
      timestamp: Math.floor(Date.now() / 1000),
    });

    const res = await app.request(
      "/oauth/tink/refresh",
      { method: "POST", body, headers: { "Content-Type": "application/json", ...headers } },
      env
    );

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("propagates Tink refresh errors with the upstream status", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "invalid_grant", error_description: "refresh expired" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    );

    const body = JSON.stringify({ refresh_token: "expired" });
    const headers = await signAsDevice({
      method: "POST",
      path: "/oauth/tink/refresh",
      body,
      timestamp: Math.floor(Date.now() / 1000),
    });

    const res = await app.request(
      "/oauth/tink/refresh",
      { method: "POST", body, headers: { "Content-Type": "application/json", ...headers } },
      env
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "invalid_grant",
      message: "refresh expired",
    });
  });
});

