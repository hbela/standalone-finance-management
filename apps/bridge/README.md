# @standalone-finance/bridge

Zero-knowledge OAuth bridge for Tink. Cloudflare Worker. Stateless — holds the Tink client secret and forwards token-exchange / token-refresh calls; persists nothing.

Part of the **Mobile-First Bridge Track** (M1) — see `C:/Users/hajze/Documents/obsidian/my-vault/Projects/Standalone Finance Management/Mobile-First Bridge Track.md`.

## What it does

Three responsibilities, nothing else:

1. **Authorization-code exchange.** Tink redirects the user's browser to `GET /oauth/tink/callback`. The Worker calls Tink's token endpoint with `client_secret`, then 302-redirects to `standalone-finance://oauth/tink#<token-fragment>` so the mobile app picks the tokens up via deep link.
2. **Token refresh.** Mobile sends `POST /oauth/tink/refresh` with `{ refresh_token }`, signed by the device's Ed25519 key. The Worker calls Tink's refresh endpoint, returns the new tokens.
3. **Health check.** `GET /health` for uptime probes.

The Worker logs no token contents and stores no state — no KV, no D1, no caches.

## Endpoints

| Method | Path | Purpose | Authentication |
|---|---|---|---|
| `GET` | `/health` | Liveness probe | None |
| `GET` | `/oauth/tink/callback` | Tink redirect after bank auth | `state` parameter (opaque, verified by mobile) |
| `POST` | `/oauth/tink/refresh` | Refresh Tink access token | Ed25519 request signature |
| `GET` | `/tink/data/v2/accounts` | Proxy to Tink accounts API | Bearer access token |
| `GET` | `/tink/data/v2/transactions` | Proxy to Tink transactions API | Bearer access token |

## Request signature

`POST /oauth/tink/refresh` requires three headers:

- `X-Public-Key`: base64 (or base64url) Ed25519 public key, raw 32 bytes.
- `X-Timestamp`: unix seconds. Must be within ±300 s of server clock.
- `X-Signature`: base64 (or base64url) Ed25519 signature of:

  ```
  ${X-Timestamp}\n${METHOD}\n${path}\n${sha256_hex(body)}
  ```

The bridge does **not** track public keys — anyone with a valid Ed25519 keypair can call. The signature plus timestamp prevents tampering and replay; rate limiting / abuse prevention is left to Cloudflare's platform-level controls.

## Local development

```sh
npm install
cp .dev.vars.example .dev.vars              # fill in your sandbox client_id/secret
npm run dev -w @standalone-finance/bridge   # wrangler dev on http://127.0.0.1:8787
npm run test -w @standalone-finance/bridge  # vitest
npm run typecheck -w @standalone-finance/bridge
```

For local testing of the deep-link flow you'll need to register `http://127.0.0.1:8787/oauth/tink/callback` as a redirect URI in the Tink Console, OR use a tunnel (e.g. `cloudflared tunnel`) and register the public URL.

## Deployment

```sh
# One-time: log in
npx wrangler login

# Set secrets (these are NOT in wrangler.toml)
npx wrangler secret put TINK_CLIENT_ID
npx wrangler secret put TINK_CLIENT_SECRET
npx wrangler secret put TINK_REDIRECT_URI       # https://bridge.<your-domain>/oauth/tink/callback

# Deploy
npm run deploy -w @standalone-finance/bridge
```

Then in the Tink Console, register the deployed redirect URI.

## What this Worker does **not** do

- Does not store tokens (passes them through to the deep link).
- Does not store user identity, mappings, push tokens, or anything else.
- Does not handle webhooks (mobile polls; webhooks are out of scope for v1 of the Mobile-First Bridge Track).
