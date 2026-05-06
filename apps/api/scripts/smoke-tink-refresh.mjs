/**
 * Smoke test for the access-token refresh path.
 *
 * Drives withTinkAccessToken from dist/tinkSession.js with stubbed
 * vault and Tink HTTP, then asserts:
 *   - proactive refresh fires when expiresAt < now + leeway
 *   - 401 from Tink data calls triggers refresh-and-retry
 *   - rotated tokens are persisted via updateProviderTokens
 *   - missing refresh_token surfaces as TinkAuthError
 *   - non-401 errors do NOT trigger refresh
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
const fetchCalls = [];

globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  const method = (init?.method ?? "GET").toUpperCase();
  fetchCalls.push({ url, method });

  if (url.endsWith("/api/v1/oauth/token") && method === "POST") {
    const body = init?.body?.toString() ?? "";
    const params = new URLSearchParams(body);
    if (params.get("grant_type") !== "refresh_token") {
      throw new Error(`unexpected grant_type ${params.get("grant_type")}`);
    }
    return new Response(
      JSON.stringify({
        access_token: `rotated-${fetchCalls.filter((c) => c.url.endsWith("/api/v1/oauth/token")).length}`,
        refresh_token: "next-refresh-token",
        token_type: "Bearer",
        expires_in: 1800,
        scope: "accounts:read,transactions:read"
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }

  return realFetch(input, init);
};

const { withTinkAccessToken } = await import("../dist/tinkSession.js");
const {
  storeProviderTokens,
  readProviderTokens,
  deleteProviderTokens
} = await import("../dist/tokenVault.js");

if (!process.env.CONVEX_URL || !process.env.API_SERVICE_SECRET) {
  console.error(
    "smoke-tink-refresh requires a live Convex dev deployment (CONVEX_URL + API_SERVICE_SECRET)."
  );
  process.exit(1);
}

const SMOKE_CLERK_USER_ID = "user_smoke_refresh";

async function seedTokenRow(tokens) {
  return await storeProviderTokens(tokens, { clerkUserId: SMOKE_CLERK_USER_ID });
}

async function fetchVault(tokenRef) {
  return await readProviderTokens(tokenRef);
}

async function cleanupVault(tokenRef) {
  await deleteProviderTokens(tokenRef).catch(() => undefined);
}

const log = {
  info: () => undefined,
  warn: () => undefined
};

function countTokenCalls() {
  return fetchCalls.filter((call) => call.url.endsWith("/api/v1/oauth/token")).length;
}

async function scenarioProactiveRefresh() {
  fetchCalls.length = 0;
  const tokenRef = await seedTokenRow({
    provider: "tink",
    accessToken: "stale-access-token",
    refreshToken: "valid-refresh-token",
    tokenType: "Bearer",
    scope: "accounts:read,transactions:read",
    expiresAt: Date.now() - 1000,
    receivedAt: Date.now() - 3600_000
  });

  try {
    const seen = [];
    await withTinkAccessToken(
      tokenRef,
      async (accessToken, tokens) => {
        seen.push({ accessToken, expiresAt: tokens.expiresAt });
        return "ok";
      },
      log
    );

    assert.equal(seen.length, 1, "callback runs once after proactive refresh");
    assert.match(seen[0].accessToken, /^rotated-/, "callback receives rotated access token");
    assert.ok(seen[0].expiresAt > Date.now(), "expiresAt is updated");

    const stored = await fetchVault(tokenRef);
    assert.match(stored.accessToken, /^rotated-/, "vault has rotated access token");
    assert.equal(stored.refreshToken, "next-refresh-token", "refresh token rotated");
    assert.equal(countTokenCalls(), 1, "exactly one refresh call");
  } finally {
    await cleanupVault(tokenRef);
  }
}

async function scenarioRetryOn401() {
  fetchCalls.length = 0;
  const tokenRef = await seedTokenRow({
    provider: "tink",
    accessToken: "fresh-but-rejected",
    refreshToken: "valid-refresh-token",
    tokenType: "Bearer",
    scope: "accounts:read,transactions:read",
    expiresAt: Date.now() + 600_000,
    receivedAt: Date.now()
  });

  try {
    let calls = 0;
    const { TinkAuthError } = await import("../dist/tinkClient.js");
    const result = await withTinkAccessToken(
      tokenRef,
      async (accessToken) => {
        calls += 1;
        if (calls === 1) {
          assert.equal(accessToken, "fresh-but-rejected", "first call uses original token");
          throw new TinkAuthError("token rejected", 401);
        }
        assert.match(accessToken, /^rotated-/, "retry uses rotated token");
        return "second-call-ok";
      },
      log
    );

    assert.equal(result, "second-call-ok");
    assert.equal(calls, 2, "callback retried exactly once");
    assert.equal(countTokenCalls(), 1, "exactly one refresh call on 401");

    const stored = await fetchVault(tokenRef);
    assert.match(stored.accessToken, /^rotated-/, "vault has rotated access token");
  } finally {
    await cleanupVault(tokenRef);
  }
}

async function scenarioMissingRefreshToken() {
  fetchCalls.length = 0;
  const tokenRef = await seedTokenRow({
    provider: "tink",
    accessToken: "stale-access-token",
    refreshToken: undefined,
    expiresAt: Date.now() - 1000,
    receivedAt: Date.now()
  });

  try {
    await assert.rejects(
      () => withTinkAccessToken(tokenRef, async () => "should not run", log),
      /no refresh token/i,
      "missing refresh token surfaces as auth error"
    );

    assert.equal(countTokenCalls(), 0, "no refresh attempted without refresh token");
  } finally {
    await cleanupVault(tokenRef);
  }
}

async function scenarioNon401ErrorPasses() {
  fetchCalls.length = 0;
  const tokenRef = await seedTokenRow({
    provider: "tink",
    accessToken: "fresh-access-token",
    refreshToken: "valid-refresh-token",
    expiresAt: Date.now() + 600_000,
    receivedAt: Date.now()
  });

  try {
    await assert.rejects(
      () =>
        withTinkAccessToken(
          tokenRef,
          async () => {
            throw new Error("downstream 502");
          },
          log
        ),
      /downstream 502/,
      "non-auth errors propagate"
    );

    assert.equal(countTokenCalls(), 0, "no refresh on non-auth error");
  } finally {
    await cleanupVault(tokenRef);
  }
}

async function scenarioRefreshFailureSurfaces() {
  fetchCalls.length = 0;
  const tokenRef = await seedTokenRow({
    provider: "tink",
    accessToken: "stale-token",
    refreshToken: "rejected-refresh-token",
    expiresAt: Date.now() - 1000,
    receivedAt: Date.now()
  });

  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.endsWith("/api/v1/oauth/token")) {
      return new Response(
        JSON.stringify({ error: "invalid_grant", error_description: "refresh expired" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }
    return previousFetch(input, init);
  };

  try {
    await assert.rejects(
      () => withTinkAccessToken(tokenRef, async () => "unreachable", log),
      /refresh/i,
      "refresh failure surfaces as error"
    );
  } finally {
    globalThis.fetch = previousFetch;
    await cleanupVault(tokenRef);
  }
}

await scenarioProactiveRefresh();
await scenarioRetryOn401();
await scenarioMissingRefreshToken();
await scenarioNon401ErrorPasses();
await scenarioRefreshFailureSurfaces();

console.log("Tink token refresh smoke checks passed:");
console.log(" - proactive refresh on near-expiry (1 token call, rotated stored)");
console.log(" - retry once on 401, then succeed");
console.log(" - missing refresh_token surfaces as auth error");
console.log(" - non-401 errors do NOT trigger refresh");
console.log(" - refresh failure surfaces, no infinite loop");
