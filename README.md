# Wise Finance Management

A Turborepo workspace for a multi-currency personal finance cockpit. The mobile app is an Expo React Native MVP using React Native Paper, Clerk auth, Convex persistence, manual finance entry, CSV import, and a Wise-ready API scaffold.

Phase 1 is implemented: signed-in users can create, edit, import, and archive accounts, transactions, and liabilities through Convex-backed flows, with loading, empty, error, validation, and settings surfaces in the app.

## Run

```bash
npm install
npm run start
```

Metro runs from `apps/mobile` on `http://localhost:8081` by default. Open the project with Expo Go, an emulator, or Expo web.

To run the Fastify API scaffold:

```bash
npm run start:api
```

The API listens on `http://localhost:4000` and exposes `GET /health`.

Copy `apps/api/.env.example` to `apps/api/.env` and fill in the Clerk, Convex, and Wise values before testing protected routes.

For the Expo app, keep client-safe values in the root `.env.local` with the `EXPO_PUBLIC_` prefix. Set `EXPO_PUBLIC_ENABLE_AUTH_PROVIDERS=true` to use Clerk and Convex instead of local demo state:

```bash
EXPO_PUBLIC_CONVEX_URL=https://your-project.convex.cloud
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_key
EXPO_PUBLIC_ENABLE_AUTH_PROVIDERS=true
```

The mobile workspace scripts load the root `.env.local`, so browser testing can stay simple from the repo root:

```bash
npm run web
```

## Workspace Scripts

```bash
npm run dev          # run workspace dev tasks through Turbo
npm run typecheck    # typecheck every workspace
npm run build        # build workspaces that have build outputs
npm run start:mobile # start the Expo app
npm run web          # start Expo directly in the web browser
npm run web:clear    # start Expo web with Metro cache cleared
npm run start:api    # start the Fastify API in watch mode
npm run convex:dev   # link/run the Convex backend
```

## Project Shape

```text
apps/
  mobile/        Expo React Native app
    src/
      components/   shared Paper-based UI
      data/         seed banks, category metadata, and local demo records
      screens/      onboarding, dashboard, transactions, debts, settings
      state/        finance context with local demo mode and Convex persistence mode
      theme/        React Native Paper theme
      utils/        money formatting and FX summary helpers
  api/           Fastify backend for backend-only workflows such as Wise

packages/
  shared/        shared finance types, constants, and seed metadata
```

## Current Backend Baseline

- `apps/api` is a TypeScript Fastify service with a `/health` route.
- `apps/api` has public `/config` and `/banks` routes plus Clerk-protected `/me` and `/wise/*` placeholders.
- `convex/` contains the schema, Clerk auth config, authenticated user/bank functions, and user-scoped finance mutations.
- `apps/mobile` wraps the app in Clerk and Convex providers when Expo public env values are set and auth providers are enabled.
- `packages/shared` contains the first shared API response and finance domain types.
- Without auth providers, the mobile app runs in local demo mode with in-memory records for the current app session.

Run `npm run convex:dev` once to link this repo to your Convex app and generate Convex's `_generated` TypeScript files.

## MVP Finance Flows

- Dashboard account rows can be edited or archived.
- Ledger rows can be edited or archived; archiving reverses the transaction's balance impact.
- CSV import reports the actual Convex imported/skipped counts.
- Debt cards can be edited or archived.
- Settings supports base currency, locale, and sign-out.
- Convex-backed screens show loading, empty, and finance action error states.
