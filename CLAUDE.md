# Wise Finance Management

Personal-finance app with EU bank aggregation via Tink and a forward-looking PFM layer (categorisation, recurring detection, income streams, expense profile, 30-day balance forecast). Mobile is Expo + React Native + react-native-paper. Backend is a single Cloudflare Worker that holds nothing.

## Architecture

End-state shape, fully landed as of 2026-05-12 (M6 cleanup complete):

- **Mobile (Expo, `apps/mobile/`)** holds everything: Expo SQLite ledger, SecureStore for tokens, ported PFM heuristics, Frankfurter FX cache (in SQLite, 24h TTL), biometric gate via `expo-local-authentication`. No cloud identity.
- **Bridge (`apps/bridge/`, Cloudflare Worker)** is stateless. Holds `TINK_CLIENT_SECRET`, exchanges OAuth codes for tokens (`/oauth/tink/{callback,refresh}`), and proxies Tink data calls with CORS headers (`/tink/data/v2/{accounts,transactions}`). Stores nothing.

The legacy `convex/`, `apps/api/`, `@clerk/clerk-expo`, and Coolify deployment are gone — `git log -- convex apps/api` recovers the history if you ever need it. Current focus: **M7** — App Store readiness (privacy policy, store listings, icon/splash, accessibility pass, crash reporting, encrypted export).

The plan is at `C:/Users/hajze/Documents/obsidian/my-vault/Projects/Wise Finance Management/Mobile-First Bridge Track.md` (M1–M8).

## Repo layout

```
apps/
  mobile/             # Expo app — the runtime product
    App.tsx           # Probe biometric → unlock → render shell (~225 lines)
    src/
      auth/           # biometric.ts (probe + authenticate via expo-local-authentication)
      components/     # AppLockScreen, Shell, MetricCard, AddAccountDialog, …
      db/             # client.ts (drizzle + expo-sqlite), schema.ts, repositories.ts,
                      # bootstrap.ts (idempotent CREATE TABLE), mappers.ts (Row types only),
                      # webFallbackStore.ts (localStorage fallback on non-isolated web)
      integrations/   # tinkBridge.ts (OAuth + signed refresh), tinkMobileClient.ts (data proxy),
                      # tinkMobileSync.ts (normalize + import), tinkCategoryMapping.ts
      screens/        # DashboardScreen, TransactionsScreen, SettingsScreen, DebtsScreen, OnboardingScreen
      services/       # fxRates.ts (Frankfurter + 24h SQLite cache), sqlitePfm.ts (detection runner),
                      # tokenRefreshScheduler.ts (background access-token refresh)
      state/          # FinanceContext.tsx (SQLiteFinanceProvider over expo-sqlite + localStorage fallback)
      utils/          # pfm.ts (detectRecurringGroups, computeExpenseProfiles, computeBalanceForecast),
                      # csvImport.ts, finance.ts, money.ts, recurring.ts
  bridge/             # Cloudflare Worker — OAuth + data proxy
    src/
      index.ts        # Hono router, mounts /oauth/{tink,wise} + /tink/data/v2 + /health
      env.ts          # Env binding shape
      routes/
        oauth.ts      # createOAuthRoutes("tink"|"wise") — GET callback, POST refresh
        tinkProxy.ts  # createTinkDataProxyRoutes — GET accounts, GET transactions (CORS)
      lib/            # signature.ts (Ed25519 verify), deepLink.ts, providers.ts (token exchange), http.ts
    test/             # Vitest smoke tests (3 files, 26 scenarios)
packages/shared/      # Shared TS types (CountryCode, CurrencyCode, …)
docs/                 # THE_TINK_LAYER, TINK_SANDBOX_TEST_SCENARIOS, TINK_CONNECTION_ISSUE_REPORT, TINK_TESTING
```

Project tracking in the Obsidian vault at `C:/Users/hajze/Documents/obsidian/my-vault/Projects/Wise Finance Management/`:
- **Mobile-First Bridge Track.md** — current direction (M1–M8).
- **Tink Hardening Track.md** — T1/T2/T3 history; the PFM heuristics from T3 are the ones now living in `apps/mobile/src/utils/pfm.ts`.

## Commands

Run from the repo root.

```sh
# Typecheck the whole repo (turbo-cached)
npm run typecheck

# Run all tests across active workspaces (mobile + bridge)
npm run test

# Mobile (the product)
npm run typecheck -w @wise-finance/mobile
npm run test -w @wise-finance/mobile        # jest --runInBand
npm run start -w @wise-finance/mobile       # Expo dev server (loads ../../.env.local)
npm run web -w @wise-finance/mobile         # Expo web

# Bridge (the Cloudflare Worker)
npm run typecheck -w @wise-finance/bridge
npm run test -w @wise-finance/bridge        # vitest, Cloudflare Workers pool
npm run dev -w @wise-finance/bridge         # wrangler dev — local Worker on 8787
npm run deploy:bridge                       # wrangler deploy — pushes to workers.dev
```

## Conventions

### Pure heuristics live in `apps/mobile/src/`

PFM heuristics are pure modules — no Convex / Fastify / SQLite dependencies.

- [apps/mobile/src/utils/pfm.ts](apps/mobile/src/utils/pfm.ts) — `detectRecurringGroups`, `computeExpenseProfiles`, `computeBalanceForecast`. `computeBalanceForecast` takes a `convertToBase: (amount, currency) => number` callback so the caller injects the FX policy (single-currency identity, multi-currency via FX snapshot, etc.).
- [apps/mobile/src/integrations/tinkCategoryMapping.ts](apps/mobile/src/integrations/tinkCategoryMapping.ts) — maps Tink category codes to the app's `Category["name"]` union.
- [apps/mobile/src/services/fxRates.ts](apps/mobile/src/services/fxRates.ts) — Frankfurter live fetch + SQLite 24h cache + static fallback. `ensureFxSnapshot(db, base, now)` is the single entry point.
- [apps/mobile/src/services/sqlitePfm.ts](apps/mobile/src/services/sqlitePfm.ts) — wraps the pure heuristics, runs them against SQLite after every sync and every relevant mutation, persists `recurringSubscriptions` / `incomeStreams` / `expenseProfiles` rows.

### Mobile data model

- Drizzle ORM over `expo-sqlite`. Schema at [apps/mobile/src/db/schema.ts](apps/mobile/src/db/schema.ts), client at [client.ts](apps/mobile/src/db/client.ts), repositories at [repositories.ts](apps/mobile/src/db/repositories.ts). Bootstrap is inline `CREATE TABLE IF NOT EXISTS` DDL run on first DB open — no drizzle-kit migrations yet (the schema hasn't changed in production).
- All amounts stored in native currency. `transactions` carry both `amount` (native) and `baseCurrencyAmount` (converted at import time using `fxRates.ts`).
- `Currency` is a closed union: `"HUF" | "EUR" | "USD" | "GBP"`. Anything else is silently filtered during Tink normalisation in [tinkMobileSync.ts](apps/mobile/src/integrations/tinkMobileSync.ts). When adding a new currency, edit the type, [utils/finance.ts](apps/mobile/src/utils/finance.ts) `eurRates`, the `normalizeCurrency` check in `tinkMobileSync.ts`, and `services/fxRates.ts` `STATIC_RATES_PER_EUR` + `normalizeFxCurrency`.

### Auth model

- Biometric only via `expo-local-authentication`. No cloud identity, no email/password.
- App-open: [App.tsx](apps/mobile/App.tsx) probes capability via [auth/biometric.ts](apps/mobile/src/auth/biometric.ts) → if available + enrolled, auto-prompts; if neither biometric nor passcode is set up, auto-bypasses; on web, auto-bypasses (dev iteration).
- Device Ed25519 keypair is lazily generated and persisted in SecureStore by [tinkBridge.ts](apps/mobile/src/integrations/tinkBridge.ts) `getOrCreateSigningKeyPair` on first signed bridge request.

### Tink integration

- OAuth: device opens Tink Link URL → Tink redirects to `https://wise-finance-bridge.hajzerbela.workers.dev/oauth/tink/callback` → bridge exchanges code for tokens with `client_secret` → 302-redirects to `wise-finance://oauth/tink#access_token=…&refresh_token=…` (or to a localhost web origin on Expo web) → mobile stores tokens in SecureStore/localStorage.
- Data fetch: mobile calls `${EXPO_PUBLIC_TINK_BRIDGE_URL}/tink/data/v2/{accounts,transactions}` with `Authorization: Bearer <access_token>`. Bridge proxies to `api.tink.com/data/v2/*` and adds `Access-Control-Allow-Origin: *` (required for Expo web; native ignores it).
- Tink v2 `accounts[].identifiers` is an **object** keyed by identifier type (`{ iban: { iban }, bban: { bban }, sortCode: ... }`), not an array. Mobile-side `extractAccountIdentifiers` tolerates both shapes.
- Categories: raw Tink code is preserved on `transactions.tinkCategoryCode`; the mapped name lives in `categoryId`. Mapping is in [tinkCategoryMapping.ts](apps/mobile/src/integrations/tinkCategoryMapping.ts).
- Background token refresh: [tokenRefreshScheduler.ts](apps/mobile/src/services/tokenRefreshScheduler.ts) exposes a pure `decideNextRefresh(tokens, now, leadSeconds)` plus a `useTinkTokenRefreshScheduler()` hook. Mounted in `<UnlockedAppShell>` so it runs only post-biometric. Re-evaluates on every `AppState` → `"active"` (which covers the OAuth deep-link return for free) and on the scheduled `setTimeout`. Refresh failures stop the loop — reconnect from Settings re-arms via the next foreground transition.
- The Tink contract is **basic Account Aggregation only** as of 2026-05-07. Enrichment / data-decisioning add-ons (Tink-native recurring, income-check, expense-check, balance-prediction) are **not** on the contract — PFM is computed in-app. If you suspect this changed before adding any new Tink scope to `EXPO_PUBLIC_TINK_SCOPES`, write a small one-off probe script against the sandbox `/oauth/cibp-uri/v1/oauth/token` endpoint; the old `apps/api/scripts/probe-tink-enrichment.mjs` was removed in M6.

### Bridge contract

- Five handlers, all pure functions of inputs. See [apps/bridge/src/index.ts](apps/bridge/src/index.ts).
- The data proxy at `/tink/data/v2/*` does not require Ed25519 signatures — the Bearer token is the auth. Only `/oauth/tink/refresh` requires a signed request (because the refresh endpoint speaks to Tink with `client_secret`, which is the actual secret to protect).
- CORS is `*`. The bridge has nothing to steal: refusing arbitrary origins would block Expo web dev without adding security.
- Bridge writes nothing — no KV, no D1, no logs of token or response contents.

### Web fallback gate

- SQLite on Expo web requires `SharedArrayBuffer`, which requires both COOP/COEP headers AND a cross-origin-isolated context (HTTPS or `localhost`).
- The gate in [apps/mobile/src/db/webFallbackStore.ts](apps/mobile/src/db/webFallbackStore.ts) `isWebFallbackStorageEnabled()` returns `true` whenever `SharedArrayBuffer` is undefined OR `globalThis.crossOriginIsolated` is falsy. Checking only the identifier is too permissive — some browsers expose `SharedArrayBuffer` as a global but throw at construction time without isolation, and the wa-sqlite worker references it directly.
- When the fallback fires, accounts/transactions/categories live in `localStorage` instead of SQLite. PFM detection no-ops on the fallback path — iterate on a phone to see income streams / expense profiles populated.

### React Query convention

- All SQLite reads are wrapped in React Query with keys under `sqliteFinanceQueryKeys.root = ["sqlite-finance", ...]` defined in [FinanceContext.tsx](apps/mobile/src/state/FinanceContext.tsx).
- Mutations invalidate the root key (`queryClient.invalidateQueries({ queryKey: sqliteFinanceQueryKeys.root })`) so every reader refetches. This includes the Tink sync mutation's `onSuccess`.

### Tests

- Mobile tests are jest under `apps/mobile/src/**/*.test.{ts,tsx}`. Run with `npm run test -w @wise-finance/mobile`. Current count: 72 across 8 suites.
- Bridge tests are vitest under `apps/bridge/test/*.test.ts`, run with the Cloudflare Workers pool. Run with `npm run test -w @wise-finance/bridge`. Current count: 26 across 3 suites.
- Native modules are mocked in [apps/mobile/jest.setup.ts](apps/mobile/jest.setup.ts): `react-native-safe-area-context`, `expo-local-authentication`. Add new mocks here when a test imports a native-only module.

## Environment

`.env.local` lives at the repo root. Mobile loads it via `dotenv-cli` in its `start` script. The bridge has its own secrets set via `wrangler secret put`. `.env.example` documents the mobile-side variables.

### Mobile

- `EXPO_PUBLIC_TINK_CLIENT_ID`
- `EXPO_PUBLIC_TINK_BRIDGE_URL` (e.g., `https://wise-finance-bridge.hajzerbela.workers.dev`)
- `EXPO_PUBLIC_TINK_REDIRECT_URI` (the bridge's callback URL)
- `EXPO_PUBLIC_TINK_WEB_REDIRECT_URI` (optional Expo web localhost return URL — runtime-derived from `window.location.origin` if missing)
- `EXPO_PUBLIC_TINK_MARKET` (use `GB` with the UK demo bank; `SE` will silently filter SEK accounts)
- `EXPO_PUBLIC_TINK_INPUT_PROVIDER` (defaults empty — set to `uk-demobank-open-banking-redirect` to skip the provider picker in the UK demo flow)
- `EXPO_PUBLIC_TINK_LOCALE` (`en_US`)
- `EXPO_PUBLIC_TINK_TEST_MODE` (`true` for sandbox)
- `EXPO_PUBLIC_TINK_SCOPES` (comma-separated; defaults to read scopes + `credentials:refresh`)

### Bridge (Cloudflare Worker)

Set via `wrangler secret put` (or `.dev.vars` for `wrangler dev`):

- `TINK_CLIENT_ID`, `TINK_CLIENT_SECRET`, `TINK_REDIRECT_URI`
- `TINK_API_BASE_URL` (`https://api.tink.com`)
- `APP_DEEP_LINK_SCHEME` (`wise-finance`)
- `SIGNATURE_TIMESTAMP_TOLERANCE_SECONDS` (defaults `300`)
- `WISE_*` are optional; the bridge returns `501 provider_not_configured` for `/oauth/wise/*` when unset.

## Sandbox & smoke checks

- Bridge health: `https://wise-finance-bridge.hajzerbela.workers.dev/health` → `{"status":"ok"}`.
- Bridge CORS smoke: `curl --ssl-no-revoke -i "https://wise-finance-bridge.hajzerbela.workers.dev/tink/data/v2/accounts"` should return `401 Unauthorized` with `access-control-allow-origin: *` (Windows curl needs `--ssl-no-revoke` because schannel can't always reach Cloudflare's CRL).
- End-to-end on a phone: connect → sync → confirm dashboard cards populate; leave idle past 119 minutes → bring app back → confirm the chip in Settings shows a fresh "Sandbox token stored <time>" (verifies the M5.4 scheduler).

## Operating notes

- Platform is Windows; PowerShell is the default shell. Bash is also wired for the Bash tool. Use absolute paths in shell commands. Avoid `cd <pwd> && …` chains — the working directory is already correct.
- Node 22+ in CI; package manager is `npm@11.9.0`. Don't switch to pnpm/yarn.
- `git status` is the source of truth for branch state. Never amend pushed commits without an explicit ask.
- After any code change to `apps/bridge/src/*`, you must `npm run deploy:bridge` for the change to take effect on `wise-finance-bridge.hajzerbela.workers.dev`. `wrangler dev` runs locally on `:8787` if you need a faster loop.
