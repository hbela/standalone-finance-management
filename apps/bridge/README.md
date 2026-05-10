# @wise-finance/bridge

Zero-knowledge OAuth bridge for Tink + Wise. Cloudflare Worker. Stateless — holds the provider client secrets and forwards token-exchange / token-refresh calls; persists nothing.

Part of the **Mobile-First Bridge Track** (M1) — see `C:/Users/hajze/Documents/obsidian/my-vault/Projects/Wise Finance Management/Mobile-First Bridge Track.md`.

## What it does

Three responsibilities, nothing else:

1. **Authorization-code exchange.** Provider redirects the user's browser to `GET /oauth/<provider>/callback`. The Worker calls the provider's token endpoint with `client_secret`, then 302-redirects to `wise-finance://oauth/<provider>#<token-fragment>` so the mobile app picks the tokens up via deep link.
2. **Token refresh.** Mobile sends `POST /oauth/<provider>/refresh` with `{ refresh_token }`, signed by the device's Ed25519 key. The Worker calls the provider's refresh endpoint, returns the new tokens.
3. **Health check.** `GET /health` for uptime probes.

The Worker logs no token contents and stores no state — no KV, no D1, no caches.

## Endpoints

| Method | Path | Purpose | Authentication |
|---|---|---|---|
| `GET` | `/health` | Liveness probe | None |
| `GET` | `/oauth/tink/callback` | Tink redirect after bank auth | `state` parameter (opaque, verified by mobile) |
| `POST` | `/oauth/tink/refresh` | Refresh Tink access token | Ed25519 request signature |
| `GET` | `/oauth/wise/callback` | Wise redirect after user auth | `state` parameter |
| `POST` | `/oauth/wise/refresh` | Refresh Wise access token | Ed25519 request signature |

## Request signature

`POST /oauth/<provider>/refresh` requires three headers:

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
cp .dev.vars.example .dev.vars        # fill in your sandbox client_id/secret
npm run dev -w @wise-finance/bridge   # wrangler dev on http://127.0.0.1:8787
npm run test -w @wise-finance/bridge  # vitest
npm run typecheck -w @wise-finance/bridge
```

For local testing of the deep-link flow you'll need to register `http://127.0.0.1:8787/oauth/tink/callback` (and the wise equivalent) as a redirect URI in the Tink Console / Wise Platform, OR use a tunnel (e.g. `cloudflared tunnel`) and register the public URL.

## Deployment

```sh
# One-time: log in
npx wrangler login

# Set secrets (these are NOT in wrangler.toml)
npx wrangler secret put TINK_CLIENT_ID
npx wrangler secret put TINK_CLIENT_SECRET
npx wrangler secret put TINK_REDIRECT_URI       # https://bridge.<your-domain>/oauth/tink/callback
npx wrangler secret put WISE_CLIENT_ID
npx wrangler secret put WISE_CLIENT_SECRET
npx wrangler secret put WISE_REDIRECT_URI

# Deploy
npm run deploy -w @wise-finance/bridge
```

Then in the Tink Console + Wise Platform, register the deployed redirect URI.

## What this Worker does **not** do

- Does not store tokens (passes them through to the deep link).
- Does not store user identity, mappings, push tokens, or anything else.
- Does not handle webhooks (mobile polls; webhooks are out of scope for v1 of the Mobile-First Bridge Track).
- Does not call Tink/Wise data APIs (mobile does that directly with the access token).
