Your roadmap is solid. The key is: **do not rely on Demo Bank alone**. Use it for real Tink integration mechanics, then use seeded/mock scenarios for the serious cases that Demo Bank cannot produce on demand.

Tink’s Demo Bank is explicitly for testing with simulated bank data without real credentials, and Tink sandbox apps are intended for demo-data testing. Events v2 webhooks and consent flows also have their own APIs/docs, so those should be tested separately from the “bank UI” itself. ([docs.tink.com][1])

## Recommended test split

```txt
Tink Demo Bank:
- OAuth / Link flow
- connect-accounts
- connect-more-accounts
- token exchange
- basic accounts fetch
- basic transactions fetch
- credential metadata shape

Your own seeded/mock data:
- expired tokens
- pending → booked lifecycle
- multi-bank edge cases
- FX conversion
- webhook replay
- reconnect_required
- recurring subscriptions
- income/expense detection
- forecast scenarios
```

## Phase 1 test plan

### 1. Stable Tink user ID

Test:

```txt
Connect once
Disconnect locally
Connect again as same Clerk user
```

Expected:

```txt
externalUserId === standalone-finance:${clerkUserId}
Only one Tink user creation for that Clerk user
providerConnections.externalUserId remains stable
```

This should be an **integration test with mocked Tink API logs**, not only manual Demo Bank testing.

### 2. Existing-user connect-more-accounts

Test two flows:

```txt
Fresh user → connect-accounts
Existing tokenRef → connect-more-accounts
```

Expected:

```txt
Fresh user uses connect-accounts
Existing user uses connect-more-accounts
delegateToClient=true
idHint present
data scopes used
```

Add a URL-builder unit test. This catches most OAuth regressions without needing the real Link UI.

### 3. Convex token vault

Test:

```txt
storeProviderTokens()
readProviderTokens()
updateProviderTokens()
deleteProviderTokens()
```

Expected:

```txt
No filesystem dependency
ciphertext stored in Convex
accessToken not visible in plaintext
refresh update preserves tokenRef
```

Also test failure:

```txt
wrong API secret → mutation rejected
missing tokenRef → read returns null / controlled error
```

### 4. Token refresh

Seed a token with:

```txt
expiresAt = Date.now() - 1000
refreshToken = valid mocked refresh token
```

Expected:

```txt
withTinkAccessToken refreshes before calling listAccounts/listTransactions
new token is persisted
original API call succeeds
```

Also test:

```txt
API call returns 401 once
refresh succeeds
API call retried exactly once
```

### 5. Live FX

Use mocked FX provider responses.

Test:

```txt
User baseCurrency = HUF
Transaction currency = EUR
amount = 10 EUR
EUR/HUF = 390
```

Expected:

```txt
baseCurrencyAmount = 3900 HUF
rateSource = live/cache/fallback
```

For Frankfurter-style ECB rates, test indirect conversion:

```txt
USD → HUF via EUR
```

### 6. Mobile reconnect state

Patch Convex:

```txt
providerConnections.status = reconnect_required
```

Expected mobile UI:

```txt
Warning card visible
Sync disabled
Reconnect CTA visible
```

## Phase 2 test plan

### 7. Webhook signature verification

Use captured or handcrafted payloads.

Test:

```txt
valid X-Tink-Signature → accepted
invalid signature → 401
same eventId twice → second ignored
```

Tink signs Events v2 webhook messages, so keep this test close to raw-body handling. ([docs.tink.com][2])

### 8. Credential-status branching

Mock `listTinkCredentials()`:

```txt
AUTHENTICATION_ERROR
SESSION_EXPIRED
TEMPORARY_ERROR
```

Expected:

```txt
AUTHENTICATION_ERROR → reconnect_required + 409
SESSION_EXPIRED → reconnect_required + 409
TEMPORARY_ERROR → retryable / temporary failure
```

Also assert:

```txt
consentEvents row written
lastErrorCode populated
no account/transaction fetch after fatal credential status
```

### 9. Consent expiry and extend-consent

Tink consent update/extension requires redirecting the user to a Tink URL with `credentialsId` and a single-use authorization code. ([docs.tink.com][3])

Test:

```txt
provider consent has sessionExpiryDate
sync stores consentExpiresAt
extend-consent route returns Link URL
URL contains credentials_id
state is HMAC-protected
```

### 10. Pending → booked

Seed two Tink-like transactions:

```txt
pending:
  amount=-1299
  date=2026-05-06
  description="LIDL"

booked:
  amount=-1299
  date=2026-05-07
  description="LIDL"
```

Expected:

```txt
first sync inserts pending
second sync patches same transaction to booked
no duplicate ledger entry
dedupe hash intentionally ignores providerTransactionId
```

### 11. Multi-bank under one Tink user

Mock credentials:

```txt
credential A: OTP
credential B: Erste
```

Mock accounts with `credentialsId`.

Expected:

```txt
2 tinkCredentials rows
accounts linked to correct credentialsId
mobile shows independent status rows
refresh/reconnect action targets only selected credential
```

### 12. Balance snapshots

Run sync twice on the same day.

Expected:

```txt
one balanceSnapshots row per account per day
second sync updates or skips, but does not duplicate
```

Then run with mocked next-day date:

```txt
new snapshot row created
```

## Phase 3 test plan

### 13. Category mapping

Test this bug specifically:

```txt
Tink category = expenses:food.groceries
```

Expected:

```txt
transactions.tinkCategoryCode = expenses:food.groceries
transactions.categoryId = real Convex category _id
```

Never put the raw Tink category string into `categoryId`.

### 14. Recurring detection

If Tink enrichment is enabled, mock its recurring response. Otherwise use your own heuristic.

Seed:

```txt
Spotify - 3 monthly transactions
Netflix - 3 monthly transactions
One-off restaurant - 1 transaction
```

Expected:

```txt
Spotify subscription created
Netflix subscription created
Restaurant ignored
transactions.isRecurring = true for matched rows
```

### 15. Income / expense check

Mock enrichment response:

```txt
monthly income = 850000 HUF
confidence = 0.92
```

Expected:

```txt
incomeStreams row upserted
dashboard renders monthly income estimate
```

### 16. Forecast

Seed:

```txt
current balance: 500000 HUF
monthly income: 850000 HUF
subscriptions: -20000 HUF
rent: -250000 HUF
```

Expected:

```txt
30-day forecast includes known recurring inflows/outflows
changing subscription amount updates forecast
```

## The most important testing improvement

Create a **Tink fixture suite**:

```txt
apps/api/test/fixtures/tink/
  accounts.demo.json
  transactions.booked.json
  transactions.pending.json
  credentials.active.json
  credentials.expired.json
  provider-consents.json
  webhook.refresh-finished.json
  webhook.credentials-status-updated.json
  enrichment.recurring.json
  enrichment.income-check.json
```

Then your tests become deterministic:

```txt
Demo Bank validates integration shape.
Fixtures validate business correctness.
Convex seeded scenarios validate product behavior.
```

## My suggested first serious test file order

```txt
1. tink-link-url-builder.test.mjs
2. token-vault-convex.test.mjs
3. tink-token-refresh.test.mjs
4. tink-credential-state.test.mjs
5. tink-normalization.test.mjs
6. tink-pending-booked-dedupe.test.mjs
7. tink-webhook-signature.test.mjs
8. tink-consent-lifecycle.test.mjs
9. tink-ledger-import.test.mjs
10. tink-enrichment-pfm.test.mjs
```

## Practical verdict

Your roadmap is realistic, but testing should be layered:

```txt
Unit tests:
normalizers, URL builders, FX math, dedupe hashes

Integration tests:
Convex mutations, token vault, import pipeline

Contract-style tests:
mocked Tink HTTP responses

Manual Tink Sandbox tests:
Link, OAuth, Demo Bank, webhook registration

Seeded product tests:
PFM, recurring, income, forecast
```

That is how you test this seriously without being blocked by the Demo Bank being read-only.

[1]: https://docs.tink.com/entries/articles/demo-bank?utm_source=chatgpt.com "Demo Bank"
[2]: https://docs.tink.com/entries/articles/webhook-signature-validation?utm_source=chatgpt.com "Webhook signature validation"
[3]: https://docs.tink.com/entries/articles/managing-consents?utm_source=chatgpt.com "Managing consents"
