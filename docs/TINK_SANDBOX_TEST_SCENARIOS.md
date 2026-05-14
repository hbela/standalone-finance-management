# Tink Sandbox Test Scenarios

Use these scenarios with a Tink Sandbox app and demo bank to verify the read-only aggregation flow end to end.

## Preconditions

- Root `.env.local` has `EXPO_PUBLIC_API_URL=http://localhost:4000` and auth providers enabled for mobile testing.
- `apps/api/.env` or the API process environment has Clerk, Convex, `API_SERVICE_SECRET`, `OAUTH_STATE_SECRET`, `TOKEN_ENCRYPTION_KEY`, and the Tink sandbox credentials.
- `TINK_REDIRECT_URI` matches the callback URL registered in the Tink app, usually `http://localhost:4000/integrations/tink/callback`.
- `APP_REDIRECT_URL` points to the app surface you are testing, for example `http://localhost:8081` for Expo web or `standalone-finance://` for native.
- `TINK_SCOPES` includes `accounts:read,balances:read,transactions:read,provider-consents:read,user:read,credentials:read,credentials:refresh`.
- `TINK_LINK_BASE_URL` uses the transactions connection flow: `https://link.tink.com/1.0/transactions/connect-accounts`.
- Sandbox runs use `TINK_MARKET=GB`, `TINK_TEST_MODE=true`, `TINK_LOCALE=en_US`, `TINK_INPUT_PROVIDER=uk-demobank-open-banking-redirect`, and `TINK_INPUT_USERNAME=u12345` to preselect the GB Tink Demo Bank (Open Banking redirect). The exact slug enabled for a given Tink app may differ — run `node apps/api/scripts/list-tink-providers.mjs` to list providers your client has access to. Set `TINK_USE_INPUT_PREFILL=false` to debug Link without provider and username prefill while keeping those env values.
- By default sandbox uses a one-time Link URL with `response_type=code` and scopes on the URL. Set `TINK_USE_EXISTING_USER=true` only when testing the existing-user Link path; if Link cannot fetch that user, it may show `REQUEST_FAILED_FETCH_EXISTING_USER`.
- Use `TINK_LINK_AUTH_MODE=code` for Transactions Link. Token mode is only for targeted debugging and can be rejected by Link with `INVALID_STATE_PROVIDER`.
- The API and Convex backend are running, then the Expo app is opened as a signed-in user.

## Automated Coverage

Run the API normalization scenarios:

```bash
npm run test -w @standalone-finance/api
```

These cover sandbox-shaped account balances, transaction amount/date variants, pending transaction skips, unsupported currency skips, transaction type mapping, and provider dedupe hash stability.

## Scenario 1: First Connection And Full Sync

1. Open the app as a signed-in user.
2. Go to Settings and start Tink bank aggregation.
3. Complete Tink Link with the demo bank. Depending on the selected demo bank, Tink may offer multiple sign-in methods such as Mobile BankID, Password and OTP, or Redirect.
4. Confirm the callback returns to the app with `provider=tink` and `status=authorized`.
5. Trigger Sync.

Expected result:

- Tink status shows connected.
- Connected bank accounts appear on the Dashboard as `source: "local_bank"`.
- Account names, currencies, types, and booked balances match the demo bank.
- Posted transactions appear in the ledger.
- Pending transactions are not imported.
- Provider connection sync status is success.

## Scenario 2: Account-Only Sync

1. Connect the demo bank if it is not already connected.
2. Call `POST /integrations/tink/sync/accounts` from the signed-in API session.

Expected result:

- The response reports fetched/imported/skipped account counts.
- Existing Tink accounts are updated instead of duplicated.
- Archived provider accounts with the same provider account id are restored.
- Manual and CSV accounts are unchanged.

## Scenario 3: Transaction Date Window

1. Connect and sync accounts first.
2. Call `POST /integrations/tink/sync/transactions` with a narrow body:

```json
{
  "from": "2026-05-01",
  "to": "2026-05-31"
}
```

Expected result:

- The API passes the date window to Tink.
- Only posted transactions returned by Tink in that window are prepared for import.
- Transactions whose provider account id has not been synced are skipped.
- The response reports fetched, prepared, skipped-before-import, imported, and skipped-during-import counts.

## Scenario 4: Idempotent Resync

1. Run a full sync.
2. Run the same full sync again without changing sandbox data.

Expected result:

- Accounts report updates, not new creates.
- Transactions already imported by provider dedupe hash are skipped during import.
- Ledger transaction count does not grow on the second sync.
- Account balances still match Tink booked balances.

## Scenario 5: Manual And CSV Data Isolation

1. Create one manual account and import one CSV statement.
2. Connect the demo bank and run a full Tink sync.
3. Disconnect Tink.

Expected result:

- Manual and CSV accounts/transactions remain visible after Tink sync and disconnect.
- Tink-created local bank accounts and transactions remain read-only aggregation records.
- Disconnect removes token access and marks the provider disconnected.

## Scenario 6: Error Handling

1. Temporarily use an invalid Tink token or revoke the demo bank consent.
2. Trigger account sync or full sync.

Expected result:

- The API returns `502` with `error: "sync_failed"`.
- Provider connection status stores the last sync failure and error message.
- No partial invalid account or transaction rows are imported.

## Scenario 7: Unsupported Or Incomplete Sandbox Payloads

Use a sandbox/demo payload that includes at least one unsupported currency, missing account id, missing transaction date, missing transaction amount, or pending transaction.

Expected result:

- Unsupported/incomplete accounts increment skipped account count.
- Unsupported/incomplete/pending transactions increment skipped-before-import count.
- The sync still imports valid rows from the same response.
