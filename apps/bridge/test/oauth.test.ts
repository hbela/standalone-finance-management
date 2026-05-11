import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../src/index.js";
import type { Env } from "../src/env.js";
import {
  base64Encode,
  buildSignedMessage,
} from "../src/lib/signature.js";

const env: Env = {
  TINK_CLIENT_ID: "tink-client-id",
  TINK_CLIENT_SECRET: "tink-client-secret",
  TINK_REDIRECT_URI: "https://bridge.example.com/oauth/tink/callback",
  TINK_API_BASE_URL: "https://api.tink.test",
  WISE_CLIENT_ID: "wise-client-id",
  WISE_CLIENT_SECRET: "wise-client-secret",
  WISE_REDIRECT_URI: "https://bridge.example.com/oauth/wise/callback",
  WISE_API_BASE_URL: "https://api.wise.test",
  APP_DEEP_LINK_SCHEME: "wise-finance",
  SIGNATURE_TIMESTAMP_TOLERANCE_SECONDS: "300",
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function generateKeyPair() {
  return crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as Promise<CryptoKeyPair>;
}

async function exportRawPublicKey(key: CryptoKey) {
  return new Uint8Array(await crypto.subtle.exportKey("raw", key));
}

async function signAsDevice(input: { method: string; path: string; body: string; timestamp: number }) {
  const { publicKey, privateKey } = await generateKeyPair();
  const message = await buildSignedMessage(
    String(input.timestamp),
    input.method,
    input.path,
    input.body
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("Ed25519", privateKey, message as BufferSource)
  );
  return {
    "X-Public-Key": base64Encode(await exportRawPublicKey(publicKey)),
    "X-Timestamp": String(input.timestamp),
    "X-Signature": base64Encode(sig),
  };
}

describe("GET /health", () => {
  it("returns ok", async () => {
    const res = await app.request("/health", {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});

describe("GET /oauth/tink/callback", () => {
  it("redirects to wise-finance:// deep link with tokens on success", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "tink-access",
          refresh_token: "tink-refresh",
          expires_in: 7200,
          token_type: "bearer",
          scope: "accounts:read",
        }),
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
    expect(location!.startsWith("wise-finance://oauth/tink#")).toBe(true);
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
        JSON.stringify({
          access_token: "tink-access",
          refresh_token: "tink-refresh",
        }),
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

describe("POST /oauth/wise/refresh", () => {
  it("uses HTTP Basic auth with client_id:client_secret", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: "wise-access", expires_in: 3600 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const body = JSON.stringify({ refresh_token: "wise-refresh" });
    const headers = await signAsDevice({
      method: "POST",
      path: "/oauth/wise/refresh",
      body,
      timestamp: Math.floor(Date.now() / 1000),
    });

    const res = await app.request(
      "/oauth/wise/refresh",
      { method: "POST", body, headers: { "Content-Type": "application/json", ...headers } },
      env
    );

    expect(res.status).toBe(200);
    const [calledUrl, init] = fetchMock.mock.calls[0]!;
    expect(String(calledUrl)).toBe("https://api.wise.test/oauth/token");
    const expectedAuth = `Basic ${btoa("wise-client-id:wise-client-secret")}`;
    expect((init.headers as Record<string, string>).Authorization).toBe(expectedAuth);
    const sentBody = init.body as URLSearchParams;
    expect(sentBody.get("grant_type")).toBe("refresh_token");
    expect(sentBody.get("refresh_token")).toBe("wise-refresh");
  });

  it("returns not configured when Wise OAuth secrets are absent", async () => {
    const body = JSON.stringify({ refresh_token: "wise-refresh" });
    const headers = await signAsDevice({
      method: "POST",
      path: "/oauth/wise/refresh",
      body,
      timestamp: Math.floor(Date.now() / 1000),
    });
    const tinkOnlyEnv: Env = {
      ...env,
      WISE_CLIENT_ID: undefined,
      WISE_CLIENT_SECRET: undefined,
      WISE_REDIRECT_URI: undefined,
    };

    const res = await app.request(
      "/oauth/wise/refresh",
      { method: "POST", body, headers: { "Content-Type": "application/json", ...headers } },
      tinkOnlyEnv
    );

    expect(res.status).toBe(501);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({
      error: "provider_not_configured",
      message: "Wise OAuth is not configured for this bridge deployment",
    });
  });
});
