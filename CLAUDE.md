# Wise Finance Management

Personal-finance app with EU bank aggregation via Tink and a forward-looking PFM layer (categorisation, recurring detection, income streams, expense profile, 30-day balance forecast). Mobile is Expo + React Native + react-native-paper; backend is a Fastify API plus Convex (DB + reactive server functions); auth is Clerk.

## Repo layout

```
apps/
  api/                # Fastify Node API — Tink/Wise integrations, FX, webhook listener
    src/
      routes/         # tink.ts, tinkWebhooks.ts, wise.ts, me.ts, banks.ts, health.ts
      *.ts            # tinkClient, tinkSession, tokenVault, oauthState,
                      # fxRates, tinkCategoryMapping, tinkCredentialState,
                      # recurringDetection, expenseProfiling, balanceForecasting, …
    test/*.mjs        # Plain Node test scripts that import from dist/
    scripts/          # Sandbox probes + smoke tests against the live Tink dev contract
  mobile/             # Expo app — DashboardScreen, TransactionsScreen, SettingsScreen, …
convex/               # Convex schema + queries/mutations (Convex bundles this folder)
  _generated/         # Auto-generated; regenerate via `npx convex codegen` after schema edits
packages/shared/      # Shared TS types (CountryCode, CurrencyCode, …)
docs/                 # THE_TINK_LAYER, TINK_SANDBOX_TEST_SCENARIOS, TINK_CONNECTION_ISSUE_REPORT
```

The current state of the integration is tracked in the user's Obsidian vault at `C:/Users/hajze/Documents/obsidian/my-vault/Projects/Wise Finance Management/Tink Hardening Track.md` (T1 hardening / T2 aggregation depth / T3 enrichment & PFM). The companion source plan is at `C:/Users/hajze/.claude/plans/look-at-what-features-enchanted-river.md`. Read those for "why" — the codebase is the source of truth for "what".

## Commands

Run from the repo root.

```sh
# Typecheck the whole repo (turbo-cached)
npm run typecheck

# Run all tests (turbo orchestrates api + mobile)
npm run test

# Workspace-scoped variants
npm run typecheck -w @wise-finance/api
npm run test -w @wise-finance/api          # builds dist/ then runs node test/*.mjs
npm run test -w @wise-finance/mobile        # jest --runInBand

# After ANY change to convex/schema.ts or convex/*.ts:
npx convex codegen                          # regenerates convex/_generated/*

# Dev servers
npm run start:api                           # Fastify + tsx watcher
npm run start                               # Expo (mobile)
npx convex dev                              # Convex dev deployment + live codegen
```

## Conventions

### Pure heuristics live in `apps/api/src/`

PFM heuristics (`recurringDetection.ts`, `expenseProfiling.ts`, `balanceForecasting.ts`) are pure modules with no Convex or Fastify dependencies. They are **imported** by Convex via cross-directory paths (e.g., `import { detectRecurringGroups } from "../apps/api/src/recurringDetection.js"`) — Convex's bundler accepts this. The same modules are built to `apps/api/dist/` so `node test/*.mjs` scripts can import the compiled output. Don't duplicate the logic into `convex/` — keep one source of truth in api/src.

### Convex query/mutation shape

- User-context handlers call `getCurrentUser(ctx)` from [convex/model.ts](convex/model.ts) and bail out if null. Throw `"Not signed in"` for mutation auth, return `[]`/empty result for queries.
- Backend-context mutations gated by an `apiSecret` arg verified against `process.env.API_SERVICE_SECRET`. Only the Fastify API has this secret. Pattern: see `apiImportProviderTransactions`, `apiDetectForUser` mutations.
- After schema edits, **always** run `npx convex codegen` before typechecking — `convex/_generated/dataModel.d.ts` is what the rest of the repo types against.

### Tink integration

- Token vault is Convex-backed AES-256-GCM ([apps/api/src/tokenVault.ts](apps/api/src/tokenVault.ts) + [convex/providerTokens.ts](convex/providerTokens.ts)). Don't bring back the file vault — `TOKEN_ENCRYPTION_KEY` env is required.
- All Tink data calls go through `withTinkAccessToken(tokenRef, fn)` ([apps/api/src/tinkSession.ts](apps/api/src/tinkSession.ts)) for proactive refresh + 401 retry.
- Tink categorisation is mapped to app categories via [apps/api/src/tinkCategoryMapping.ts](apps/api/src/tinkCategoryMapping.ts). The raw code is preserved on `transactions.tinkCategoryCode`; the mapped name lives in `categoryId`.
- Webhooks: `POST $TINK_WEBHOOK_PATH`, HMAC-SHA256 verified, idempotent via `providerWebhookEvents.eventId`. Metadata-only — no payload bodies persisted.
- The contract is **basic Account Aggregation only** as of 2026-05-07. Tink enrichment / data-decisioning add-ons (recurring, income-check, expense-check, balance-prediction) are **not** on the contract. Re-run `node apps/api/scripts/probe-tink-enrichment.mjs` if you suspect this changed before adding any new Tink scope to `config.tinkScopes`.

### PFM layer is in-app heuristic, not Tink-native

- Recurring subscriptions, income streams, expense profile, and balance forecast are all computed in-app from the transaction ledger — no Tink enrichment product is involved.
- Detection runs after every Tink sync via `runRecurringDetection` / `runIncomeDetection` / `runExpenseProfileDetection` in [apps/api/src/routes/tink.ts](apps/api/src/routes/tink.ts). All three are non-fatal; sync still returns success if detection fails.
- Forecasting is a Convex `query` (reactive), not an `action` — every mutation to subs/income/accounts auto-recomputes on the mobile dashboard.

### Tests

- API tests are plain `.mjs` Node scripts under `apps/api/test/` that import from `apps/api/dist/`. Pattern: build, then run each test file via `node`. Add new test files to the `test` script in [apps/api/package.json](apps/api/package.json).
- Avoid `.mts` test files — Node 24's experimental TS-strip clashes with `tsx` for named imports of `.ts` files; the `dist/*.js` workflow sidesteps it.
- Mobile tests are jest under `apps/mobile/src/**/*.test.{ts,tsx}` — `npm run test -w @wise-finance/mobile`.

### Money & currency

- All amounts in Convex are stored in their native currency. `transactions` carry both `amount` (native) and `baseCurrencyAmount` (converted at import time using `apps/api/src/fxRates.ts`, which caches Frankfurter rates for 24h).
- The forecast query is **per-currency** — pass the user's `baseCurrency` (default) or override via the `currency` arg. Multi-currency rollup needs FX inside Convex queries, which isn't wired yet.

## Environment

`.env.local` lives at the repo root and at `apps/api/.env.local`. The api loads both. Mobile uses repo-root `.env.local` via `dotenv-cli`.

Required for backend:
- `CONVEX_URL`, `API_SERVICE_SECRET`, `TOKEN_ENCRYPTION_KEY`, `OAUTH_STATE_SECRET`
- `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- `TINK_CLIENT_ID`, `TINK_CLIENT_SECRET`, `TINK_REDIRECT_URI`, `TINK_MARKET`, `TINK_LOCALE`
- `TINK_WEBHOOK_SECRET`, `TINK_WEBHOOK_PATH` (defaults to `/integrations/tink/webhook`)

Optional with sane defaults: `FX_PROVIDER_URL`, `FX_CACHE_TTL_MS`, `TINK_API_BASE_URL`, `TINK_LINK_BASE_URL`, `TINK_SCOPES`, `TINK_USE_EXISTING_USER`, `TINK_LINK_AUTH_MODE`.

Mobile-specific (loaded via Expo `EXPO_PUBLIC_*`): `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, `EXPO_PUBLIC_CONVEX_URL`, `EXPO_PUBLIC_API_BASE_URL`.

## Sandbox & smoke tests

- [apps/api/scripts/probe-tink-enrichment.mjs](apps/api/scripts/probe-tink-enrichment.mjs) — verifies which Tink scopes the contract grants. Run before adding any new scope.
- [apps/api/scripts/list-tink-providers.mjs](apps/api/scripts/list-tink-providers.mjs) — dumps providers visible in the configured market.
- [apps/api/scripts/smoke-tink-existing-user.mjs](apps/api/scripts/smoke-tink-existing-user.mjs) / `smoke-tink-refresh.mjs` / `smoke-tink-fx.mjs` — wire-format guards on the existing-user Link flow, token refresh path, and FX conversion. Run with `node` after `npm run build -w @wise-finance/api`.

## Operating notes

- Platform is Windows; PowerShell is the default shell. Bash is also wired for the Bash tool. Use absolute paths in shell commands. Avoid `cd <pwd> && …` chains — the working directory is already correct.
- Node 22+ in CI; package manager is `npm@11.9.0`. Don't switch to pnpm/yarn.
- `git status` is the source of truth for branch state. Never amend pushed commits without an explicit ask.
- Don't reintroduce mocking of the Convex deployment in tests — the existing test suite is unit-level over pure modules, and integration is exercised through smoke scripts against the live dev deployment.
