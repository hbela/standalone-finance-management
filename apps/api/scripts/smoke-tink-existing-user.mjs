/**
 * Smoke test for the existing-user Tink Link path.
 *
 * Mocks globalThis.fetch and calls the real createTinkUser /
 * createTinkAuthorization wrappers from dist/tinkClient.js, then
 * recreates the Link URL exactly as routes/tink.ts builds it.
 * Verifies wire-format invariants:
 *   - createTinkUser uses external_user_id = "wise-finance:${userId}"
 *   - createTinkAuthorization hits /authorization-grant/delegate
 *     with actor_client_id, data scopes, id_hint
 *   - Link URL is connect-more-accounts (not connect-accounts)
 *   - Link URL carries authorization_code, no response_type/scope
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

process.env.TINK_USE_EXISTING_USER = "true";
process.env.TINK_LINK_AUTH_MODE = "code";

const calls = [];
const realFetch = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = init?.headers ?? {};
  const contentType =
    (headers instanceof Headers ? headers.get("content-type") : headers["Content-Type"] ?? headers["content-type"]) ?? "";
  const bodyText =
    init?.body && typeof init.body !== "string" && "toString" in init.body
      ? init.body.toString()
      : init?.body;

  let body = null;
  if (typeof bodyText === "string" && bodyText.length > 0) {
    if (contentType.includes("application/json")) {
      try {
        body = JSON.parse(bodyText);
      } catch {
        body = null;
      }
    } else {
      body = Object.fromEntries(new URLSearchParams(bodyText));
    }
  }

  calls.push({ url, method, body, headers });

  if (url.endsWith("/api/v1/oauth/token") && method === "POST") {
    return jsonResponse({
      access_token: "mock-client-token",
      token_type: "Bearer",
      expires_in: 1800
    });
  }

  if (url.endsWith("/api/v1/user/create") && method === "POST") {
    return jsonResponse({ user_id: "mock-tink-user-id" });
  }

  if (url.endsWith("/api/v1/oauth/authorization-grant/delegate") && method === "POST") {
    return jsonResponse({ code: "mock-authorization-code-32-chars-aaaa" });
  }

  if (url.endsWith("/api/v1/oauth/authorization-grant") && method === "POST") {
    throw new Error(
      "Smoke check: non-delegated authorization-grant endpoint should NOT be called when delegateToClient=true"
    );
  }

  return realFetch(input, init);
};

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" }
  });
}

const { config } = await import("../dist/config.js");
const { createTinkUser, createTinkAuthorization } = await import("../dist/tinkClient.js");

assert.equal(config.tinkLinkAuthMode, "code", "Expected TINK_LINK_AUTH_MODE=code default");
assert.ok(config.tinkScopes.length > 0, "Expected non-empty tinkScopes");
assert.ok(config.tinkClientId, "TINK_CLIENT_ID must be set in .env.local");

const clerkUserId = "user_smoke_existing_user";
const externalUserId = `wise-finance:${clerkUserId}`;

const created = await createTinkUser({
  externalUserId,
  market: config.tinkMarket,
  locale: config.tinkLocale
});

const userCreateCall = calls.find((call) => call.url.endsWith("/api/v1/user/create"));
assert.ok(userCreateCall, "expected POST /api/v1/user/create");
assert.equal(
  userCreateCall.body?.external_user_id,
  externalUserId,
  "external_user_id must match wise-finance:${clerkUserId}"
);
assert.equal(userCreateCall.body?.market, config.tinkMarket);
assert.equal(userCreateCall.body?.locale, config.tinkLocale);

const grant = await createTinkAuthorization({
  userId: created.user_id,
  scopes: config.tinkScopes,
  idHint: `wise-finance:${clerkUserId.slice(-12)}`,
  delegateToClient: true
});

const grantCall = calls.find((call) =>
  call.url.endsWith("/api/v1/oauth/authorization-grant/delegate")
);
assert.ok(grantCall, "expected POST /api/v1/oauth/authorization-grant/delegate");
assert.equal(grantCall.body?.user_id, created.user_id);
assert.equal(
  grantCall.body?.actor_client_id,
  config.tinkClientId,
  "actor_client_id must equal config.tinkClientId on delegate grant"
);
assert.equal(grantCall.body?.response_type, "code");
const grantedScopes = (grantCall.body?.scope ?? "").split(",").filter(Boolean);
const dataScopeNames = ["accounts:read", "transactions:read"];
for (const scope of dataScopeNames) {
  assert.ok(
    grantedScopes.includes(scope),
    `delegate grant must include data scope ${scope} (got ${grantedScopes.join(",")})`
  );
}
const operationOnlyScopes = ["authorization:grant", "credentials:write"];
for (const scope of operationOnlyScopes) {
  assert.ok(
    !grantedScopes.includes(scope),
    `delegate grant must NOT include operation scope ${scope}`
  );
}
assert.equal(grantCall.body?.id_hint, `wise-finance:${clerkUserId.slice(-12)}`);

const linkAuthorizationCode = grant.code;
const linkBaseUrl = "https://link.tink.com/1.0/transactions/connect-more-accounts";
const linkUrl = new URL(linkBaseUrl);
linkUrl.searchParams.set("client_id", config.tinkClientId);
linkUrl.searchParams.set("redirect_uri", config.tinkRedirectUri);
linkUrl.searchParams.set("market", config.tinkMarket);
linkUrl.searchParams.set("locale", config.tinkLocale);
linkUrl.searchParams.set("state", "smoke-state");
linkUrl.searchParams.set("authorization_code", linkAuthorizationCode);
if (config.tinkTestMode) {
  linkUrl.searchParams.set("test", "true");
}

assert.equal(
  linkUrl.pathname,
  "/1.0/transactions/connect-more-accounts",
  "URL must use connect-more-accounts for existing-user flow"
);
assert.equal(linkUrl.searchParams.get("authorization_code"), linkAuthorizationCode);
assert.equal(linkUrl.searchParams.get("response_type"), null, "must NOT set response_type");
assert.equal(linkUrl.searchParams.get("scope"), null, "must NOT set scope");

const nonDelegatedCall = calls.find((call) =>
  call.url.endsWith("/api/v1/oauth/authorization-grant") &&
  !call.url.endsWith("/delegate")
);
assert.equal(nonDelegatedCall, undefined, "non-delegated grant endpoint must not be called");

console.log("Smoke checks passed:");
console.log(" - external_user_id:", externalUserId);
console.log(" - delegate endpoint hit with actor_client_id and data scopes");
console.log(" - Link URL:", linkUrl.toString());
