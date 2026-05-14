# Standalone Finance Management

Personal-finance app with EU bank aggregation via Tink and a forward-looking PFM layer (categorisation, recurring detection, income streams, expense profile, 30-day balance forecast).

- **Mobile** (`apps/mobile/`) — Expo React Native using React Native Paper. Holds the Expo SQLite ledger, SecureStore for tokens, ported PFM heuristics, Frankfurter FX cache, and biometric gate via `expo-local-authentication`. No cloud identity.
- **Bridge** (`apps/bridge/`) — Stateless Cloudflare Worker. Holds `TINK_CLIENT_SECRET`, exchanges OAuth codes for tokens, and proxies Tink data calls. Stores nothing.

See [CLAUDE.md](CLAUDE.md) for the full architecture and conventions.

## Run

```bash
npm install
npm run start         # Expo dev server for the mobile app
npm run web           # Expo web
```

## Workspace scripts

```bash
npm run typecheck     # turbo typecheck across mobile + bridge + shared
npm run test          # mobile (jest) + bridge (vitest)
npm run dev -w @standalone-finance/bridge    # wrangler dev on :8787
npm run deploy:bridge                        # wrangler deploy
```

## Repo layout

```
apps/
  mobile/             Expo app — the runtime product
  bridge/             Cloudflare Worker — OAuth + Tink data proxy
packages/
  shared/             shared TS types
docs/                 Tink integration notes
```

## Environment

`.env.local` lives at the repo root and is loaded into Expo via `dotenv-cli`. The bridge has its own secrets set via `wrangler secret put`. `.env.example` documents the mobile-side variables.
