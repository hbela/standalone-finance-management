# Wise Finance Management Roadmap

This roadmap starts from the current working baseline:

- Clerk and Convex authentication are connected.
- Accounts, expenses, liabilities, edits, and CSV import persist in Convex.
- The mobile app has onboarding, dashboard, transactions, and debts screens.
- The API service has Clerk-protected routes and Wise placeholders.
- The Convex schema already includes future tables for Wise connections and consent events.

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

Goal: make imported and manually entered data trustworthy.

- Improve CSV import mapping with a preview step, field mapping, date format detection, and account selection confirmation.
- Store import batches so each CSV import can be reviewed, reverted, or audited later.
- Strengthen deduplication beyond the current hash by checking date, amount, account, merchant, and description similarity.
- Add manual transfer matching between accounts so internal moves do not inflate spending or income.
- Add category management instead of free-form category strings.
- Add recurring transaction detection and recurring payment review.
- Add balance reconciliation: show when computed balance differs from account balance.

Suggested acceptance check:

- A user can import a bank statement, review what changed, fix categories, and understand whether balances still line up.

## Phase 3: Wise Integration

Goal: replace Wise placeholders with a real, consented sync path.

- Implement Wise OAuth start/callback routes in `apps/api`.
- Store Wise tokens securely outside client-readable state; keep only references/status in Convex.
- Persist Wise connection status in `wiseConnections`.
- Record consent grants/revocations in `consentEvents`.
- Fetch Wise profiles, balances, and transactions through the API service.
- Add Convex mutations/actions for syncing Wise accounts and transactions into the existing account/transaction tables.
- Add sync status, last synced time, and reconnect/disconnect controls in the mobile app.
- Add failure handling for expired tokens, revoked access, and partial syncs.

Suggested acceptance check:

- A user can connect Wise, sync balances and transactions, disconnect Wise, and still keep previously imported/manual data intact.

## Phase 4: Insights And Planning

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

## Phase 5: Privacy, Security, And Portability

Goal: make the app safe to trust with personal finance data.

- Add data export for accounts, transactions, liabilities, imports, and consent events.
- Add account deletion/data deletion workflow.
- Add server-side audit events for sensitive actions.
- Review Clerk JWT audience, issuer, and Convex auth config for production environments.
- Add environment-specific configuration docs for local, preview, and production deployments.
- Add rate limits and stricter response handling to protected API routes.
- Define a backup/restore approach for Convex data.

Suggested acceptance check:

- A user can understand, export, and delete their data, and sensitive backend actions are protected and auditable.

## Phase 6: Product Polish And Release

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

Start with the smallest set of work that makes the new Convex-backed app feel solid:

1. Add loading/error/empty states around Convex finance data.
2. Make CSV import return actual Convex import/skipped counts.
3. Add delete/edit coverage for the core records.
4. Add a simple settings/sign-out screen.
5. Refresh README with the current Clerk/Convex setup.

After that, the best product leap is Phase 2 import quality, then Phase 3 Wise sync.
