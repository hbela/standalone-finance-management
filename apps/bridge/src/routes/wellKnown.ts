import { Hono } from "hono";
import type { Env } from "../env.js";

export function buildAppleAppSiteAssociation(env: Env): unknown | null {
  const bundleId = env.IOS_APP_BUNDLE_ID?.trim();
  const teamId = env.IOS_TEAM_ID?.trim();
  if (!bundleId || !teamId) return null;
  const appId = `${teamId}.${bundleId}`;
  return {
    applinks: {
      apps: [],
      details: [
        {
          appIDs: [appId],
          components: [
            { "/": "/oauth/*", comment: "OAuth handoff after bank authorisation" },
          ],
        },
      ],
    },
    webcredentials: {
      apps: [appId],
    },
  };
}

export function buildAssetLinks(env: Env): unknown | null {
  const packageName = env.ANDROID_PACKAGE_NAME?.trim();
  const fingerprintsRaw = env.ANDROID_SHA256_FINGERPRINTS?.trim();
  if (!packageName || !fingerprintsRaw) return null;
  const fingerprints = fingerprintsRaw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (fingerprints.length === 0) return null;
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}

export function createWellKnownRoutes() {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/apple-app-site-association", (c) => {
    if (!c.env.APP_UNIVERSAL_LINK_HOST) {
      return c.json({ error: "not_configured" }, 404);
    }
    const body = buildAppleAppSiteAssociation(c.env);
    if (!body) {
      return c.json({ error: "ios_not_configured" }, 404);
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
    });
  });

  app.get("/assetlinks.json", (c) => {
    if (!c.env.APP_UNIVERSAL_LINK_HOST) {
      return c.json({ error: "not_configured" }, 404);
    }
    const body = buildAssetLinks(c.env);
    if (!body) {
      return c.json({ error: "android_not_configured" }, 404);
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
    });
  });

  return app;
}
