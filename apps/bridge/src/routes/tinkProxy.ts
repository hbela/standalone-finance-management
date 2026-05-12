import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "../env.js";

// Thin pass-through proxy for Tink data endpoints. Lets the mobile app — including
// Expo web — fetch accounts and transactions without hitting the browser CORS wall.
// The bridge stays stateless: it forwards Authorization: Bearer upstream and
// returns the body verbatim. No tokens or response bytes are persisted.
const corsHeaders: Parameters<typeof cors>[0] = {
  origin: "*",
  allowMethods: ["GET", "OPTIONS"],
  allowHeaders: ["Authorization", "Content-Type"],
  maxAge: 86400,
};

export function createTinkDataProxyRoutes() {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", cors(corsHeaders));

  app.get("/accounts", async (c) => proxyTinkData(c.env, c.req.raw, "/data/v2/accounts"));
  app.get("/transactions", async (c) =>
    proxyTinkData(c.env, c.req.raw, "/data/v2/transactions")
  );

  return app;
}

async function proxyTinkData(
  env: Env,
  incoming: Request,
  upstreamPath: string
): Promise<Response> {
  const authorization = incoming.headers.get("authorization");
  if (!authorization) {
    return new Response(
      JSON.stringify({ error: "unauthorized", message: "Missing Authorization header" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const incomingUrl = new URL(incoming.url);
  const upstreamUrl = new URL(`${env.TINK_API_BASE_URL}${upstreamPath}`);
  for (const [key, value] of incomingUrl.searchParams.entries()) {
    upstreamUrl.searchParams.set(key, value);
  }

  const upstreamResponse = await fetch(upstreamUrl.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: authorization,
    },
  });

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: {
      "Content-Type":
        upstreamResponse.headers.get("content-type") ?? "application/json",
    },
  });
}
