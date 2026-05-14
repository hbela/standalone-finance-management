# Tink Link Connection Issue Report

**Date:** 2026-05-05
**Reporter:** Claude (Opus 4.7) — code & config review
**Symptom (from screenshot):**

```
Error reason:      REQUEST_FAILED_FETCH_EXISTING_USER
Error status:      INTERNAL_ERROR
Product Type:      transactions
Product Dimension: connect-accounts
Tracking ID:       0095477e-8af8-4f3f-9209-ba4206d9c834
Client ID (suffix): 53a09071
Timestamp:         2026-05-05T19:56:16.352Z
```

---

## 1. TL;DR — Most Likely Root Cause

You are running Link in **"existing user" mode** (`TINK_USE_EXISTING_USER=true`) against the **Transactions / `connect-accounts` flow**, and Link is failing to fetch the freshly-created Tink user.

`REQUEST_FAILED_FETCH_EXISTING_USER` is Tink Link's generic "I tried to load the user that the `authorization_code` represents and the lookup failed" error. In your flow there are exactly **three plausible causes**, ranked from most to least likely:

1. **Mode/flow mismatch**: `connect-accounts` (transactions Link) is intended primarily for **first-time** connections of a *new* user. The code path you're in calls `createTinkUser` → `createTinkAuthorization` → passes `authorization_code` to `connect-accounts`. Tink's docs route the **existing-user / one-time delegated** Link flow through `transactions/connect-more-accounts` (or `transactions/extend-consent` / `credentials/...`), not `connect-accounts`. Link sees the `authorization_code` parameter on `connect-accounts` and tries to "fetch existing user" — and rejects the combo.
2. **Authorization grant scopes are wrong for delegating a Link session**. The grant code you mint is being scoped with the *Link operation* scopes (`authorization:read`, `authorization:grant`, `credentials:read/write/refresh`, `providers:read`, `user:read`). For a **Link-delegated** authorization grant Tink expects the **data scopes** the user is consenting to (the `accounts:read,balances:read,transactions:read,...` set you already have in `TINK_SCOPES`) and an `id_hint`. The grant you mint cannot be redeemed by Link, so when Link tries to "fetch the existing user" via that grant, it fails.
3. **The grant is not delegated to your client** (`actor_client_id` / `delegate=true` is never set), so even if the scopes were right, Link cannot use the code to act on behalf of your client.

**The simplest fix to verify the cause** (do not implement yet — you asked for analysis only):

Set `TINK_USE_EXISTING_USER=false` in the API environment and reconnect. That makes the code skip the user creation + authorization grant block (lines 150–186 of [routes/tink.ts](apps/api/src/routes/tink.ts#L150-L186)) and falls through to the URL-builder branch that uses `response_type=code` + `scope=...` (lines 222–225). That is the correct shape for `connect-accounts`. If the error disappears, the diagnosis above is confirmed.

---

## 2. Evidence from your logs

Last request (`req-2`) shows exactly what was sent to Tink Link:

```
linkBaseUrl:   https://link.tink.com/1.0/transactions/connect-accounts
linkAuthMode:  code
useInputPrefill: true
inputProvider:   testbank-gb
hasInputUsername: true
```

```
"tink link user created"           tinkUserId=a675…3ba
"tink link authorization granted"  authorizationCodeLength=32
"tink link url built"              authorizationCodeLength=32 (in URL)
                                   responseType=null   ← absent on purpose
                                   scope=null          ← absent on purpose
```

So the URL Tink received was:

```
https://link.tink.com/1.0/transactions/connect-accounts
  ?client_id=…53a09071
  &redirect_uri=http://localhost:4000/integrations/tink/callback
  &market=GB
  &locale=en_US
  &state=…
  &authorization_code=…   ← 32 chars, minted from createTinkAuthorization
  &test=true
  &input_provider=testbank-gb
  &input_username=…
```

That URL shape — **`connect-accounts` + `authorization_code`, with no `response_type`/`scope`** — is the "delegated existing user" shape. The `authorization_code` tells Link "look up the user this code is for and resume their session." When that lookup fails, Link returns `REQUEST_FAILED_FETCH_EXISTING_USER`. Your `Tracking ID 0095477e…` is the trace Tink Support would need.

---

## 3. Code paths involved

### 3.1 Branching that produced the failing URL

[apps/api/src/routes/tink.ts:150-186](apps/api/src/routes/tink.ts#L150-L186) — guarded by `config.tinkUseExistingUser`:

```ts
if (config.tinkUseExistingUser) {
  const externalUserId = `standalone-finance:${userId}:${randomUUID()}`;
  const tinkUser = await createTinkUser({ externalUserId, market, locale });
  tinkUserId = tinkUser.user_id;

  const linkAuthorization = await createTinkAuthorization({
    userId: tinkUser.user_id,
    scopes: tinkLinkAuthorizationScopes,   // ← Link/operation scopes, see §3.3
  });
  linkAuthorizationCode = linkAuthorization.code;
}
```

[apps/api/src/routes/tink.ts:205-225](apps/api/src/routes/tink.ts#L205-L225) — URL builder:

```ts
if (linkAuthorizationCode && config.tinkLinkAuthMode === "token") {
  // exchange code -> token, send authorization_token
} else if (linkAuthorizationCode) {
  url.searchParams.set("authorization_code", linkAuthorizationCode);   // ← this branch fires
} else {
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.tinkScopes.join(","));
}
```

So when `TINK_USE_EXISTING_USER=true` and `TINK_LINK_AUTH_MODE=code` (your current setting per `.env.example`), Link receives `authorization_code=…` and **no** `response_type` or `scope`. That puts Link into "fetch existing user from this code" mode — which is what's failing.

### 3.2 Authorization grant call

[apps/api/src/tinkClient.ts:155-204](apps/api/src/tinkClient.ts#L155-L204) — `createTinkAuthorization`:

- POSTs to `/api/v1/oauth/authorization-grant` (non-delegated path).
- Sends only `user_id` and `scope`. **`id_hint` is omitted**, and `actor_client_id`/`delegate` is `false`.
- For Tink Link to be able to consume this grant on the user's behalf, the grant typically needs to be **delegated** (`/api/v1/oauth/authorization-grant/delegate` with `actor_client_id=<your_client_id>` and an `id_hint`). The non-delegated grant produces a code your **own backend** can exchange for a *backend* access token — not a code Link can resume a user session with.

### 3.3 Wrong scopes on the Link grant

[apps/api/src/routes/tink.ts:36-44](apps/api/src/routes/tink.ts#L36-L44):

```ts
const tinkLinkAuthorizationScopes = [
  "authorization:read",
  "authorization:grant",
  "credentials:read",
  "credentials:write",
  "credentials:refresh",
  "providers:read",
  "user:read",
];
```

These are **operation scopes** (the kind you'd use for backend client-credential calls or for `credentials/refresh` Link). For `transactions/connect-accounts` Link, the user is authorising **data access**, so the scope set should mirror `TINK_SCOPES`:

```
accounts:read,balances:read,transactions:read,
provider-consents:read,user:read,
credentials:read,credentials:refresh
```

(Notice the absence of `accounts:read`/`balances:read`/`transactions:read` in the current `tinkLinkAuthorizationScopes` array — Link almost certainly rejects/cannot route a delegated session built from a code that doesn't carry those.)

### 3.4 `connect-accounts` semantics

[apps/api/src/config.ts:65-67](apps/api/src/config.ts#L65-L67):

```ts
tinkLinkBaseUrl: process.env.TINK_LINK_BASE_URL ??
  "https://link.tink.com/1.0/transactions/connect-accounts",
```

`connect-accounts` is the entry-point Link URL for a brand-new connection (no prior `authorization_code`). For "use this existing Tink user, skip the bank picker" you want either:

- `transactions/connect-more-accounts` (existing user, add another bank), or
- `transactions/extend-consent` (refresh consent), or
- the `credentials/connect-accounts` family (specific credential).

Combining **`connect-accounts` + `authorization_code`** is the shape Link is choking on.

### 3.5 Your own doc already calls this out

[docs/TINK_SANDBOX_TEST_SCENARIOS.md:14](docs/TINK_SANDBOX_TEST_SCENARIOS.md#L14) (already in the repo):

> By default sandbox uses a one-time Link URL with `response_type=code` and scopes on the URL. Set `TINK_USE_EXISTING_USER=true` only when testing the existing-user Link path; **if Link cannot fetch that user, it may show `REQUEST_FAILED_FETCH_EXISTING_USER`.**

So someone already expected this exact failure mode. The current run is hitting that documented edge case.

---

## 4. Configuration review

| Setting                    | Value (from log)                                  | Comment                                                              |
| -------------------------- | ------------------------------------------------- | -------------------------------------------------------------------- |
| `TINK_LINK_BASE_URL`       | `…/transactions/connect-accounts`                 | OK for first-time connection; **wrong for "existing user" path**.    |
| `TINK_MARKET`              | `GB`                                              | OK — matches `testbank-gb`.                                          |
| `TINK_LOCALE`              | `en_US`                                           | OK.                                                                  |
| `TINK_TEST_MODE`           | `true`                                            | OK — `&test=true` is on the URL.                                     |
| `TINK_INPUT_PROVIDER`      | `testbank-gb`                                     | OK for sandbox.                                                      |
| `TINK_INPUT_USERNAME`      | (set, value redacted)                             | Should be `u12345` or similar Tink demo username — verify.            |
| `TINK_USE_INPUT_PREFILL`   | `true`                                            | OK.                                                                  |
| `TINK_USE_EXISTING_USER`   | `true` (must be — log shows user creation)        | **Suspect — flip to `false` to test.**                               |
| `TINK_LINK_AUTH_MODE`      | `code`                                            | OK for the existing-user path; irrelevant if `USE_EXISTING_USER=false`.|
| `TINK_REDIRECT_URI`        | `http://localhost:4000/integrations/tink/callback`| **Must exactly match the URI registered in the Tink app console.**    |
| Client ID suffix           | `53a09071`                                        | Sandbox client (full ID `9e47460d…71` shown by Tink).                 |

Two config-level items to verify outside the code:

1. **Tink app console → Redirect URIs**: `http://localhost:4000/integrations/tink/callback` must be in the allow-list, byte-for-byte (no trailing slash, exact protocol/host/port).
2. **Tink app console → Permissions/Scopes**: the app must have at minimum `user:create`, `authorization:grant`, `accounts:read`, `balances:read`, `transactions:read`, `provider-consents:read`, `credentials:read`, `credentials:refresh`. If `user:create` is enabled but `authorization:grant` (delegated) is not, the existing-user flow can't work even when the code is correct.

---

## 5. Why exactly `REQUEST_FAILED_FETCH_EXISTING_USER` (not some other error)

Tink Link's URL builder, after seeing `?authorization_code=…` on `transactions/connect-accounts`, takes this path:

1. Decode/lookup the `authorization_code` → resolve the *user it was minted for*.
2. Hydrate that user's session inside Link.
3. Resume into the connect-accounts flow with that user pre-attached.

Step 1 calls into Tink's authorization-grant service. Anything that prevents step 1 from returning a valid user object surfaces as `REQUEST_FAILED_FETCH_EXISTING_USER`. The realistic root-cause set:

- Code minted via the **non-delegated** endpoint (your case — `createTinkAuthorization` calls `/authorization-grant`, not `/authorization-grant/delegate`). Link expects a delegated grant.
- Code minted with the **wrong scope set** (your case — Link operation scopes, not data scopes).
- `actor_client_id` mismatch between the Tink app issuing the grant and the `client_id` on the Link URL (not your case — same client).
- User created in a **different market/locale** than the Link URL (not your case — both `GB`/`en_US`).
- Code already consumed/expired (not your case — log shows fresh code seconds before the redirect).
- Tink-side outage (always possible; Tracking ID `0095477e…` is what Tink Support would correlate).

The first two are the ones present in your code today.

---

## 6. Recommended diagnostic path (no changes yet — you asked for analysis only)

In order:

1. **Disable existing-user mode**: `TINK_USE_EXISTING_USER=false`. Restart the API. Reconnect. Expect Link to render the bank picker (or jump straight to `testbank-gb` because of `input_provider`) and proceed without the fetch error. This proves the diagnosis.
2. If you specifically need the existing-user path (so the same Clerk user maps to a stable Tink user across reconnects), the fix is in code, not config:
   - Switch `createTinkAuthorization` to the **delegated** endpoint (`/api/v1/oauth/authorization-grant/delegate`) with `actor_client_id=config.tinkClientId` and `id_hint` (a human-readable label).
   - Pass **data scopes** (`config.tinkScopes`), not the Link-operation scope array at lines 36–44.
   - Persist the `tinkUserId` per Clerk user (e.g., on `providerConnections`) and reuse it instead of creating a new Tink user on every Link start (line 151 currently mints a new `external_user_id` every call — that's a separate hygiene problem).
3. Verify in the Tink Console that:
   - The redirect URI is registered exactly as `http://localhost:4000/integrations/tink/callback`.
   - The app has the scopes listed in §4.
   - The app is enabled for `transactions/connect-accounts` Link (sandbox apps sometimes lack this).
4. If steps 1–3 still produce the same error, that's a server-side issue worth filing with Tink Support, including the **Tracking ID** from the screenshot.

---

## 7. Other observations worth noting (not blocking the current bug)

- [apps/api/src/routes/tink.ts:151](apps/api/src/routes/tink.ts#L151) — `external_user_id` is a fresh UUID on every link start. Each reconnect creates a brand-new Tink user, leaking sandbox users and preventing reuse of consent. Should be deterministic per Clerk user (e.g., `standalone-finance:${userId}`).
- [apps/api/src/routes/tink.ts:336-343](apps/api/src/routes/tink.ts#L336-L343) — In the callback, when `state.tinkUserId` is set the code mints **another** authorization (this time with `config.tinkScopes`) and ignores the `?code=` Link returns. That's correct for the delegated-existing-user flow but only works if the user actually exists and the prior Link session attached a credential to it. With the current mismatch, the callback may also fail on this second grant.
- [apps/api/src/routes/tink.ts:205-219](apps/api/src/routes/tink.ts#L205-L219) — Token mode (`authorization_token`) is wired up but the code comment in `.env.example:33-34` already warns it can hit `INVALID_STATE_PROVIDER`. That's consistent with Tink's docs: the transactions Link flow uses `authorization_code` (delegated), not `authorization_token`.
- The code path that builds `linkAuthorizationCode` always proceeds to set the URL parameter even if `tinkLinkAuthMode === "code"`. That's fine, but worth confirming once you switch to delegated grants that `connect-accounts` is replaced with `connect-more-accounts` for the existing-user case.

---

## 8. One-paragraph summary for a teammate

> Tink Link is returning `REQUEST_FAILED_FETCH_EXISTING_USER` on `transactions/connect-accounts` because the API is currently running in "existing user" mode (`TINK_USE_EXISTING_USER=true`) and feeding Link an `authorization_code` that was minted via the **non-delegated** authorization-grant endpoint with **Link-operation scopes** instead of **data scopes**. Link tries to resume the Tink user behind that code, can't, and aborts. Quickest verification: set `TINK_USE_EXISTING_USER=false` and reconnect — the URL builder will fall back to the `response_type=code` + `scope=…` path, which `connect-accounts` accepts. The proper fix, if the existing-user path is required, is to call `/api/v1/oauth/authorization-grant/delegate` with `actor_client_id`, `id_hint`, and the data-scope set, and to persist `tinkUserId` per Clerk user instead of minting a new Tink user every time.
