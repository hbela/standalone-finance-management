import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../src/index.js";
import { renderHandoffHtml } from "../src/routes/oauthHandoff.js";
import { testEnv, tokenResponse, universalLinkEnv } from "./helpers.js";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OAuth callback with Universal Links enabled", () => {
  it("redirects to https://<host>/oauth/tink#tokens on success when APP_UNIVERSAL_LINK_HOST is set", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(tokenResponse()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const res = await app.request(
      "/oauth/tink/callback?code=abc&state=state-uni",
      { redirect: "manual" },
      universalLinkEnv
    );

    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location.startsWith("https://finance.appointer.hu/oauth/tink#")).toBe(true);
    const fragment = new URLSearchParams(location.split("#")[1]);
    expect(fragment.get("state")).toBe("state-uni");
    expect(fragment.get("access_token")).toBe("tink-access");
    expect(fragment.get("refresh_token")).toBe("tink-refresh");
  });

  it("redirects errors to the universal link too when host is configured", async () => {
    const res = await app.request(
      "/oauth/tink/callback?error=access_denied&error_description=cancelled&state=s",
      { redirect: "manual" },
      universalLinkEnv
    );

    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location.startsWith("https://finance.appointer.hu/oauth/tink#")).toBe(true);
    const fragment = new URLSearchParams(location.split("#")[1]);
    expect(fragment.get("error")).toBe("access_denied");
    expect(fragment.get("error_description")).toBe("cancelled");
  });

  it("still honours the localhost web-return URL on Expo web flows even when Universal Links are configured", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(tokenResponse()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const payload = Buffer.from(
      JSON.stringify({ web_redirect_uri: "http://localhost:8091/oauth/tink" })
    ).toString("base64url");
    const state = `state-web.${payload}`;

    const res = await app.request(
      `/oauth/tink/callback?code=abc&state=${encodeURIComponent(state)}`,
      { redirect: "manual" },
      universalLinkEnv
    );

    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location.startsWith("http://localhost:8091/oauth/tink#")).toBe(true);
  });

  it("falls back to custom scheme when APP_UNIVERSAL_LINK_HOST is unset", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(tokenResponse()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const res = await app.request(
      "/oauth/tink/callback?code=abc&state=fallback",
      { redirect: "manual" },
      testEnv
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")!.startsWith("standalone-finance://oauth/tink#")).toBe(true);
  });
});

describe("GET /oauth/tink (Universal Link handoff page)", () => {
  it("returns 404 when Universal Links are not configured", async () => {
    const res = await app.request("/oauth/tink", {}, testEnv);
    expect(res.status).toBe(404);
  });

  it("serves the handoff HTML when Universal Links are configured", async () => {
    const res = await app.request("/oauth/tink", {}, universalLinkEnv);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const body = await res.text();
    expect(body).toContain("Opening Standalone Finance Management");
    expect(body).toContain("standalone-finance://oauth/tink");
  });

  it("renderHandoffHtml uses the configured scheme + provider", () => {
    const html = renderHandoffHtml("custom-scheme", "tink");
    expect(html).toContain('"custom-scheme://oauth/tink"');
  });
});

describe("GET /.well-known/apple-app-site-association", () => {
  it("returns 404 when Universal Links are not configured", async () => {
    const res = await app.request("/.well-known/apple-app-site-association", {}, testEnv);
    expect(res.status).toBe(404);
  });

  it("returns 404 when iOS bundle/team are missing", async () => {
    const res = await app.request(
      "/.well-known/apple-app-site-association",
      {},
      { ...universalLinkEnv, IOS_APP_BUNDLE_ID: undefined, IOS_TEAM_ID: undefined }
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "ios_not_configured" });
  });

  it("returns a valid AASA file when configured", async () => {
    const res = await app.request(
      "/.well-known/apple-app-site-association",
      {},
      universalLinkEnv
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as {
      applinks: { details: Array<{ appIDs: string[]; components: Array<{ "/": string }> }> };
      webcredentials: { apps: string[] };
    };
    expect(body.applinks.details[0]!.appIDs).toEqual([
      "ABCDE12345.com.elyscom.standalonefinancemanagement",
    ]);
    expect(body.applinks.details[0]!.components[0]!["/"]).toBe("/oauth/*");
    expect(body.webcredentials.apps).toEqual([
      "ABCDE12345.com.elyscom.standalonefinancemanagement",
    ]);
  });
});

describe("GET /.well-known/assetlinks.json", () => {
  it("returns 404 when Universal Links are not configured", async () => {
    const res = await app.request("/.well-known/assetlinks.json", {}, testEnv);
    expect(res.status).toBe(404);
  });

  it("returns 404 when Android package/fingerprints are missing", async () => {
    const res = await app.request(
      "/.well-known/assetlinks.json",
      {},
      { ...universalLinkEnv, ANDROID_PACKAGE_NAME: undefined, ANDROID_SHA256_FINGERPRINTS: undefined }
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "android_not_configured" });
  });

  it("returns a valid assetlinks file when configured", async () => {
    const res = await app.request("/.well-known/assetlinks.json", {}, universalLinkEnv);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as Array<{
      relation: string[];
      target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] };
    }>;
    expect(body).toHaveLength(1);
    expect(body[0]!.relation).toEqual(["delegate_permission/common.handle_all_urls"]);
    expect(body[0]!.target.namespace).toBe("android_app");
    expect(body[0]!.target.package_name).toBe("com.elyscom.standalonefinancemanagement");
    expect(body[0]!.target.sha256_cert_fingerprints).toHaveLength(1);
  });

  it("trims and splits multiple comma-separated fingerprints", async () => {
    const res = await app.request(
      "/.well-known/assetlinks.json",
      {},
      {
        ...universalLinkEnv,
        ANDROID_SHA256_FINGERPRINTS: " AA:BB:CC ,DD:EE:FF , 11:22:33 ",
      }
    );
    const body = (await res.json()) as Array<{
      target: { sha256_cert_fingerprints: string[] };
    }>;
    expect(body[0]!.target.sha256_cert_fingerprints).toEqual([
      "AA:BB:CC",
      "DD:EE:FF",
      "11:22:33",
    ]);
  });
});
