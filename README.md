# Wise Finance Management

A Turborepo workspace for a multi-currency personal finance cockpit. The current mobile app is an Expo React Native MVP using React Native Paper and mock data, with backend packages now scaffolded for Clerk, Convex, Wise, CSV import, and provider adapters.

## Run

```bash
npm install
npm run start
```

Metro runs from `apps/mobile` on `http://localhost:8081` by default. Open the project with Expo Go or an emulator from the Expo CLI.

To run the Fastify API scaffold:

```bash
npm run start:api
```

The API listens on `http://localhost:4000` and exposes `GET /health`.

Copy `apps/api/.env.example` to `apps/api/.env` and fill in the Clerk, Convex, and Wise values before testing protected routes.

For the Expo app, keep client-safe values in the root `.env.local` with the `EXPO_PUBLIC_` prefix:

```bash
EXPO_PUBLIC_CONVEX_URL=https://your-project.convex.cloud
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_key
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
      data/         MVP mock banks, accounts, transactions, liabilities
      screens/      onboarding, dashboard, transactions, debts
      state/        in-memory finance store for manual MVP flows
      theme/        React Native Paper theme
      utils/        money formatting and FX summary helpers
  api/           Fastify backend for backend-only workflows such as Wise

packages/
  shared/        shared finance types, constants, and seed metadata
```

## Current Backend Baseline

- `apps/api` is a TypeScript Fastify service with a `/health` route.
- `apps/api` has public `/config` and `/banks` routes plus Clerk-protected `/me` and `/wise/*` placeholders.
- `convex/` contains the first schema, Clerk auth config, and authenticated user/bank functions.
- `apps/mobile` is ready to wrap the app in Clerk and Convex providers when Expo public env values are set.
- `packages/shared` contains the first shared API response and finance domain types.
- The mobile app remains client-only for now and keeps manually added records in memory for the current app session.

Run `npm run convex:dev` once to link this repo to your Convex app and generate Convex's `_generated` TypeScript files.
