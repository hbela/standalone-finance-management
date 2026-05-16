import { Hono } from "hono";
import type { Env } from "./env.js";
import {
  exchangeTinkAuthorizationCode,
  refreshTinkAccessToken,
} from "./lib/providers.js";
import { createOAuthRoutes } from "./routes/oauth.js";
import { renderHandoffHtml } from "./routes/oauthHandoff.js";
import { createTinkDataProxyRoutes } from "./routes/tinkProxy.js";
import { createWellKnownRoutes } from "./routes/wellKnown.js";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/.well-known", createWellKnownRoutes());

// Universal Link fallback. The OS intercepts this URL on a properly-configured
// device and routes it to the app before the browser loads the page. If we
// reach this handler at all, the Universal Link did not catch — fall back to
// the custom scheme client-side so we don't strand the user with the tokens
// stuck in a browser tab.
app.get("/oauth/tink", (c) => {
  if (!c.env.APP_UNIVERSAL_LINK_HOST) {
    return c.json({ error: "not_found" }, 404);
  }
  const html = renderHandoffHtml(c.env.APP_DEEP_LINK_SCHEME, "tink");
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
});

app.route(
  "/oauth/tink",
  createOAuthRoutes("tink", {
    exchange: exchangeTinkAuthorizationCode,
    refresh: refreshTinkAccessToken,
  })
);

app.route("/tink/data/v2", createTinkDataProxyRoutes());

app.notFound((c) => c.json({ error: "not_found" }, 404));

export default app;
