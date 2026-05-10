# Deploying to Coolify

Two Coolify Application resources, one per Dockerfile. Each gets its own domain, env vars, and deploy webhook. The Dockerfiles in this repo work as-is.

| App      | Dockerfile                  | Container port | Health path | Public role            |
|----------|-----------------------------|----------------|-------------|------------------------|
| wise-api | `apps/api/Dockerfile`       | `4000`         | `/health`   | `https://api.<domain>` |
| wise-web | `apps/mobile/Dockerfile`    | `80`           | `/`         | `https://app.<domain>` |

## Common settings (both apps)

In Coolify → **+ New** → **Application** → **Public/Private Repository**:

- **Source**: your git remote, branch `main`
- **Build Pack**: `Dockerfile`
- **Base Directory**: `/` (repo root — the Dockerfiles use root as build context)
- **Watch Paths** (optional, to skip unrelated rebuilds):
  - wise-api: `apps/api/**`, `packages/shared/**`, `package*.json`
  - wise-web: `apps/mobile/**`, `package*.json`
- **Auto Deploy**: on
- **Restart Policy**: `unless-stopped`

Coolify provisions Traefik + a Let's Encrypt cert per domain automatically — no reverse-proxy config needed on your side.

> ⚠️ Coolify prefills **Ports Exposes** to `3000` for new apps. Override it to `4000` (wise-api) or `80` (wise-web) — leaving it at `3000` will cause `502 Bad Gateway` because Traefik forwards to a port nothing is listening on.

## wise-api

**Application settings**
- Dockerfile Location: `apps/api/Dockerfile`
- Ports Exposes: `4000`
- Domain: `https://api.<your-domain>`
- Health Check → Path: `/health`, Port: `4000`, Interval: `30s`

**Environment variables** (Coolify UI → Environment Variables, all runtime — leave "Is Build Variable" off):

```
HOST=0.0.0.0
PORT=4000
CORS_ORIGIN=https://app.<your-domain>

CONVEX_URL=<prod convex deployment url>
API_SERVICE_SECRET=<random 32+ bytes>
TOKEN_ENCRYPTION_KEY=<random 32 bytes hex>
OAUTH_STATE_SECRET=<random 32+ bytes>

CLERK_PUBLISHABLE_KEY=<clerk prod key>
CLERK_SECRET_KEY=<clerk prod secret>

TINK_CLIENT_ID=<tink prod client id>
TINK_CLIENT_SECRET=<tink prod client secret>
TINK_REDIRECT_URI=https://api.<your-domain>/integrations/tink/callback
TINK_MARKET=HU
TINK_LOCALE=en_US
TINK_WEBHOOK_SECRET=<tink webhook signing secret>
TINK_WEBHOOK_PATH=/integrations/tink/webhook

WISE_ENVIRONMENT=production
WISE_CLIENT_ID=<wise prod client id>
WISE_CLIENT_SECRET=<wise prod client secret>
WISE_REDIRECT_URI=https://api.<your-domain>/integrations/wise/callback
```

Mark every secret as **"Is Secret"** in the UI so it's masked in logs. Optional: `FX_PROVIDER_URL`, `FX_CACHE_TTL_MS`, `TINK_USE_EXISTING_USER`, `TINK_LINK_AUTH_MODE` — only set if overriding defaults.

After the api is up, register the redirect URIs above with Tink and Wise.

## wise-web

**Application settings**
- Dockerfile Location: `apps/mobile/Dockerfile`
- Ports Exposes: `80`
- Domain: `https://app.<your-domain>`
- Health Check → Path: `/`, Port: `80`

**Environment variables** — these are **build-time** for the Expo web export. In Coolify, toggle **"Is Build Variable"** ON for each:

```
EXPO_PUBLIC_API_URL=https://api.<your-domain>
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=<clerk prod publishable key>
EXPO_PUBLIC_CONVEX_URL=<prod convex deployment url>
EXPO_PUBLIC_ENABLE_AUTH_PROVIDERS=true
```

Because these get baked into the JS bundle, **changing any of them requires a rebuild**, not just a restart. Coolify's "Redeploy" button handles this.

## Initial deploy order

1. Deploy `wise-api` first.
2. Verify `https://api.<your-domain>/health` returns 200.
3. Set `EXPO_PUBLIC_API_URL` on `wise-web` to that URL, then deploy `wise-web`.
4. Update Tink + Wise dashboards with the production redirect URIs.
5. Run `npx convex deploy` from your laptop to push functions to the prod Convex deployment.

## Auto-deploy on push

Each Coolify app exposes a **Deploy Webhook URL** under Application → Webhooks. Add it to your git host:

- GitHub: Repo → Settings → Webhooks → Add webhook → paste Coolify URL, content type `application/json`, event `push`
- GitLab: Settings → Webhooks → URL + secret token

With watch paths configured (above), pushes that don't touch the relevant tree won't trigger a rebuild.

## Logs & rollback

- **Logs**: Coolify UI → Application → Logs (live tail). Use this instead of `docker compose logs`.
- **Rollback**: Coolify keeps the previous image — Application → Deployments → pick a prior successful deploy → "Redeploy".
- **Shell into a container**: Application → Terminal.

## Notes

- No host port bindings, no compose file, no `.env.local` on the box. Coolify's Traefik handles ingress; env lives in the UI.
- The two apps are independent — they don't share a network and don't need to. The web bundle calls the API over its public HTTPS URL.
- Convex is hosted by Convex; nothing to deploy in Coolify for it. Just point `CONVEX_URL` at the prod deployment.
- No persistent volumes needed. The token vault is Convex-backed (see `apps/api/src/tokenVault.ts`), so containers are fully stateless.
