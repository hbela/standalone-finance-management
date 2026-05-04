# Wise Finance Management Roadmap

This roadmap starts from the current working baseline:

- Clerk and Convex authentication are connected.
- Accounts, expenses, liabilities, edits, and CSV import persist in Convex.
- The mobile app has onboarding, dashboard, transactions, and debts screens.
- The API service has Clerk-protected routes and provider placeholders.
- The Convex schema already includes future tables for Wise connections and consent events, and should evolve toward provider-neutral connection metadata.

## Phase 1: Stabilize The MVP

Status: implemented.

Goal: make the current persisted finance workflow dependable enough for daily personal use.

- [x] Add visible loading, empty, and error states for Convex-backed account, transaction, and liability queries.
- [x] Return real import results from Convex import mutations so the UI reports actual imported/skipped counts.
- [x] Add delete/archive flows for accounts, transactions, and liabilities, including safe handling for linked records.
- [x] Add account and liability edit screens, not only transaction edits.
- [x] Add basic validation for amounts, dates, required fields, and unsupported currencies before sending mutations.
- [x] Add a lightweight user settings screen for base currency, locale, and sign-out.
- [x] Update README to describe the real authenticated Convex setup instead of the older client-only baseline.

Suggested acceptance check:

- A signed-in user can create, edit, import, and remove their own financial records without refreshing or losing state.

## Phase 2: Data Quality And Reconciliation

Status: complete.

Goal: make imported and manually entered data trustworthy.

- [x] Improve CSV import mapping with a preview step, field mapping, date format detection, and account selection confirmation.
- [x] Store import batches so each CSV import can be reviewed or audited later.
- [x] Strengthen deduplication beyond the current hash by checking date, amount, account, merchant, and description similarity.
- [x] Add manual transfer matching between accounts so internal moves do not inflate spending or income.
- [x] Add category management instead of free-form category strings.
- [x] Add recurring transaction detection and recurring payment review.
- [x] Add balance reconciliation: show when computed balance differs from account balance.

Suggested acceptance check:

- A user can import a bank statement, review what changed, fix categories, and understand whether balances still line up.

## Phase 3: Tink Bank Aggregation

Goal: add the first real provider sync path by connecting bank accounts through Tink and importing read-only account and transaction data.

- Implement Tink Link start/callback routes in `apps/api`.
- Store Tink tokens securely outside client-readable state; keep only connection references, status, scopes, and sync metadata in Convex.
- Add provider-neutral connection metadata, such as `providerConnections`, instead of expanding the Wise-only roadmap shape.
- Record bank-provider connection, revocation, reconnect, and sync consent/audit events, not only Wise-specific consent.
- Sync Tink bank accounts into the existing `accounts` table as `source: "local_bank"` with provider account metadata.
- Sync Tink posted transactions into the existing `transactions` table while reusing Phase 2 dedupe, category, transfer matching, recurring review, and reconciliation behavior.
- Add connect, reconnect, disconnect, sync status, last synced time, and partial-sync failure states in the mobile app.
- Keep Tink payment initiation out of this phase; Phase 3 is read-only account and transaction aggregation.

Suggested acceptance check:

- A signed-in user can connect a bank through Tink, sync accounts and posted transactions, see sync status, reconnect or disconnect, and keep manual/CSV data intact.

## Phase 4: Wise Wallet And Money Movement

Goal: add Wise as the peer provider for wallet balances, statements, transfers, and FX after read-only bank aggregation is stable.

- Implement Wise OAuth start/callback routes in `apps/api` using the provider connection pattern introduced for Tink.
- Store Wise tokens securely outside client-readable state; keep only references/status in Convex.
- Fetch Wise profiles, balances, and statements through the API service.
- Sync Wise balances and statements into the existing account/transaction model without breaking manual, CSV, or Tink data.
- Add Wise transfer and FX conversion tracking only after Wise read sync is stable.
- Add failure handling for expired tokens, revoked access, partial syncs, failed transfers, and FX fee visibility.
- Preserve the product distinction: Tink feeds the ledger from connected banks; Wise can both feed wallet data and move money.

Suggested acceptance check:

- A user can connect Wise, sync balances/statements, review FX and transfer activity, disconnect Wise, and keep Tink/manual/CSV records intact.

## Phase 5: Insights And Planning

Goal: turn stored records into decisions.

- Add monthly cashflow charts for income, expenses, transfers, and excluded transactions.
- Add spending by category and merchant.
- Add debt payoff projections using balance, interest rate, payment amount, and frequency.
- Add net worth over time across accounts minus liabilities.
- Add currency exposure summaries using stored or configurable FX rates.
- Add filters for date range, account, currency, category, and transaction type.
- Add saved views such as "This month", "Last 90 days", and "Debt payments".

Suggested acceptance check:

- The dashboard answers: what changed this month, where money went, which debts matter most, and how much is exposed by currency.

## Phase 6: Provider Coverage And Payment Readiness

Goal: expand provider resilience and prepare safely for payment-capable integrations.

- Add TrueLayer or another aggregator as a fallback provider only after Tink sync is stable.
- Treat provider fallback as an explicit user reauthorization flow, not a silent retry.
- Add cross-provider transaction fingerprinting so the same bank account connected through multiple providers does not duplicate ledger activity.
- Add retry scheduling for temporary provider failures and clear reconnect prompts for expired or revoked consent.
- Evaluate Tink payment initiation separately with consent, SCA, compliance, audit, and failure-state requirements before implementation.
- Keep bank-to-bank payments disabled until legal, security, and UX review are complete.

Suggested acceptance check:

- A user can recover from unsupported-bank or provider-outage cases through an explicit reconnect/fallback flow, and duplicate provider data does not inflate balances or reports.

## Phase 7: Privacy, Security, And Portability

Goal: make the app safe to trust with personal finance data.

- Add data export for accounts, transactions, liabilities, imports, and consent events.
- Add account deletion/data deletion workflow.
- Add server-side audit events for sensitive actions.
- Review Clerk JWT audience, issuer, and Convex auth config for production environments.
- Add environment-specific configuration docs for local, preview, and production deployments.
- Add rate limits and stricter response handling to protected API routes.
- Review provider token storage, encryption, rotation, revocation, and audit handling across Tink and Wise.
- Define a backup/restore approach for Convex data.

Suggested acceptance check:

- A user can understand, export, and delete their data, and sensitive backend actions are protected and auditable.

## Phase 8: Product Polish And Release

Goal: make the app feel finished on web/mobile and ready to share.

- Add route/navigation structure instead of only tab state.
- Improve responsive layouts for small phones, tablets, and web.
- Add optimistic UI and toast/snackbar feedback for mutations.
- Add automated typecheck, lint, and focused tests in CI.
- Add smoke tests for auth, create account, create transaction, import CSV, and create liability.
- Add app icons, splash screen, app metadata, and release build configuration.
- Create a short demo dataset and demo walkthrough.

Suggested acceptance check:

- A new tester can sign in, understand the app, add/import data, and complete the core flows without developer guidance.

## Recommended Next Sprint

Start the Tink-before-Wise provider track:

1. Add provider-neutral connection metadata in Convex, alongside or as a replacement path for the current Wise-specific connection table.
2. Add Tink configuration to the API service and implement Tink Link start/callback scaffolding with OAuth state validation.
3. Build the Tink account sync path into existing `accounts` as `source: "local_bank"`.
4. Build the Tink transaction sync path into existing `transactions`, reusing Phase 2 dedupe and review flows.
5. Add mobile connection and sync-status controls for connect, reconnect, disconnect, and partial failure.

After that, add Wise as the peer money-movement provider, then revisit provider fallback and payment initiation.
