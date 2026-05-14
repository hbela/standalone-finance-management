# Agent Guide

This repo is a Turborepo workspace for Standalone Finance Management, a personal finance cockpit built around an Expo React Native app, a Cloudflare Worker OAuth bridge, and shared TypeScript types. (Note: this file is stale — the Convex/Clerk/Fastify scaffolding it describes was removed in M6. See CLAUDE.md for the current architecture.)

## Project Shape

- `apps/mobile`: Expo React Native app using React Native Paper, Clerk, Convex, and `dotenv-cli`.
- `apps/bridge`: Cloudflare Worker that exchanges Tink OAuth codes and proxies Tink data calls.
- `convex`: Convex schema, auth config, generated API bindings, and finance functions.
- `packages/shared`: Shared finance and API response types.

The current product baseline is described in `README.md`; planned work and priorities live in `ROADMAP.md`.

## Setup And Environment

- Use npm workspaces. The root package manager is `npm@11.9.0`.
- Install dependencies from the repo root with `npm install`.
- Keep client-safe Expo values in root `.env.local` with `EXPO_PUBLIC_` prefixes.
- Do not commit secrets from `.env.local`, API env files, Convex deployment credentials, or Clerk keys.
- Convex generated files under `convex/_generated` are checked in and may need refreshing after schema/function changes.

Common local env values:

```bash
EXPO_PUBLIC_CONVEX_URL=https://your-project.convex.cloud
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_key
```

## Useful Commands

Run these from the repo root unless noted otherwise.

```bash
npm run typecheck      # typecheck all workspaces through Turbo
npm run build          # build configured workspaces
npm run start:mobile   # start Expo
npm run web            # start Expo web using root .env.local
npm run web:clear      # start Expo web with Metro cache cleared
npm run start:api      # start Fastify API in watch mode
npm run convex:dev     # run/link Convex dev and refresh generated bindings
```

For focused checks:

```bash
npm run typecheck -w @standalone-finance/mobile
npm run typecheck -w @standalone-finance/api
npm run build -w @standalone-finance/shared
```

## Development Notes

- Prefer existing React Native Paper components and local UI patterns in `apps/mobile/src/components`.
- Keep mobile screens focused on presentation and user workflows; shared formatting helpers belong in `apps/mobile/src/utils`.
- Keep domain types in `packages/shared` when they are consumed across app/API boundaries.
- Keep Convex data access in `convex/*` functions. Use authenticated user scoping for user-owned finance records.
- The Cloudflare Worker bridge holds provider client secrets; do not expose them to the Expo client.
- When adding Convex schema or function changes, run `npm run convex:dev` or `npx convex codegen` as appropriate so generated API types stay current.
- For mobile env access, remember the Expo app scripts load `../../.env.local` via `dotenv-cli`.

## Verification Expectations

- Run `npm run typecheck` for cross-workspace TypeScript changes when feasible.
- Run a focused workspace typecheck for small isolated edits.
- For Convex schema/function/API changes, refresh generated files and typecheck the affected app code.
- For UI changes, verify Expo web or mobile behavior when practical; use `npm run web` or `npm run web:clear`.
- If a command cannot be run because credentials, services, or local tooling are missing, mention that clearly in the handoff.

## Code Style

- TypeScript first; avoid `any` unless there is no reasonable local type yet.
- Keep changes narrowly scoped to the requested behavior.
- Follow existing naming and file organization before introducing new abstractions.
- Prefer structured parsing and typed helpers over ad hoc string handling.
- Add comments only where they explain non-obvious business logic or integration constraints.

## Product Priorities

The near-term roadmap emphasizes stabilizing the Convex-backed MVP:

- Loading, empty, and error states for account, transaction, and liability queries.
- Actual CSV import results from Convex mutations.
- Delete/archive flows for core finance records.
- Edit coverage for accounts and liabilities.
- Validation for amounts, dates, required fields, and currencies.
- User settings for base currency, locale, and sign-out.
- README updates that match the real authenticated Clerk/Convex setup.

## Git And Safety

- The worktree may contain user changes. Do not revert unrelated edits.
- Do not run destructive git commands unless the user explicitly asks for them.
- Before touching sensitive auth, finance, import, or provider integration code, inspect the relevant surrounding files first.
- Treat financial data and auth flows as high-risk surfaces: prefer explicit validation, user ownership checks, and conservative error handling.
