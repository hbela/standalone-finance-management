import { Hono } from "hono";
import type { Env } from "./env.js";
import {
  exchangeTinkAuthorizationCode,
  exchangeWiseAuthorizationCode,
  refreshTinkAccessToken,
  refreshWiseAccessToken,
} from "./lib/providers.js";
import { createOAuthRoutes } from "./routes/oauth.js";
import { createTinkDataProxyRoutes } from "./routes/tinkProxy.js";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ status: "ok" }));

app.route(
  "/oauth/tink",
  createOAuthRoutes("tink", {
    exchange: exchangeTinkAuthorizationCode,
    refresh: refreshTinkAccessToken,
  })
);

app.route(
  "/oauth/wise",
  createOAuthRoutes("wise", {
    exchange: exchangeWiseAuthorizationCode,
    refresh: refreshWiseAccessToken,
  })
);

app.route("/tink/data/v2", createTinkDataProxyRoutes());

app.notFound((c) => c.json({ error: "not_found" }, 404));

export default app;
