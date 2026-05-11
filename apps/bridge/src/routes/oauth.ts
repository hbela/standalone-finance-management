import { Hono } from "hono";
import type { Env } from "../env.js";
import {
  buildOAuthDeepLink,
  buildOAuthErrorDeepLink,
  buildOAuthWebRedirect,
  type OAuthProviderName,
} from "../lib/deepLink.js";
import { jsonResponse } from "../lib/http.js";
import { ProviderTokenError, type TokenResponse } from "../lib/providers.js";
import {
  readSignatureHeaders,
  SignatureError,
  verifySignedRequest,
} from "../lib/signature.js";

export type OAuthProviderHandlers = {
  exchange: (env: Env, code: string) => Promise<TokenResponse>;
  refresh: (env: Env, refreshToken: string) => Promise<TokenResponse>;
};

export function createOAuthRoutes(provider: OAuthProviderName, handlers: OAuthProviderHandlers) {
  const app = new Hono<{ Bindings: Env }>();
  const refreshPath = `/oauth/${provider}/refresh`;

  app.get("/callback", async (c) => {
    const url = new URL(c.req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    if (error) {
      return c.redirect(
        buildOAuthErrorDeepLink({
          scheme: c.env.APP_DEEP_LINK_SCHEME,
          provider,
          state,
          error,
          errorDescription: errorDescription ?? undefined,
        }),
        302
      );
    }

    if (!code || !state) {
      return c.redirect(
        buildOAuthErrorDeepLink({
          scheme: c.env.APP_DEEP_LINK_SCHEME,
          provider,
          state,
          error: "invalid_request",
          errorDescription: "Missing code or state",
        }),
        302
      );
    }

    try {
      const tokens = await handlers.exchange(c.env, code);
      const webReturnUrl = parseLocalWebReturnUrl(state);
      if (webReturnUrl) {
        return c.redirect(
          buildOAuthWebRedirect({
            returnUrl: webReturnUrl,
            provider,
            state,
            payload: tokens,
          }),
          302
        );
      }

      return c.redirect(
        buildOAuthDeepLink({
          scheme: c.env.APP_DEEP_LINK_SCHEME,
          provider,
          state,
          payload: tokens,
        }),
        302
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Token exchange failed";
      const code =
        err instanceof ProviderTokenError && err.errorCode ? err.errorCode : "exchange_failed";
      return c.redirect(
        buildOAuthErrorDeepLink({
          scheme: c.env.APP_DEEP_LINK_SCHEME,
          provider,
          state,
          error: code,
          errorDescription: message,
        }),
        302
      );
    }
  });

  app.post("/refresh", async (c) => {
    const rawBody = await c.req.text();

    try {
      const headers = readSignatureHeaders(c.req.raw.headers);
      const tolerance = Number(c.env.SIGNATURE_TIMESTAMP_TOLERANCE_SECONDS);
      await verifySignedRequest({
        method: "POST",
        path: refreshPath,
        body: rawBody,
        headers,
        toleranceSeconds: Number.isFinite(tolerance) ? tolerance : undefined,
      });
    } catch (err) {
      if (err instanceof SignatureError) {
        return jsonResponse({ error: "unauthorized", message: err.message }, err.status);
      }
      throw err;
    }

    let parsed: { refresh_token?: unknown };
    try {
      parsed = JSON.parse(rawBody) as { refresh_token?: unknown };
    } catch {
      return jsonResponse({ error: "invalid_request", message: "Body must be JSON" }, 400);
    }

    if (typeof parsed.refresh_token !== "string" || parsed.refresh_token.length === 0) {
      return jsonResponse(
        { error: "invalid_request", message: "Missing refresh_token" },
        400
      );
    }

    try {
      const tokens = await handlers.refresh(c.env, parsed.refresh_token);
      return jsonResponse(tokens, 200);
    } catch (err) {
      if (err instanceof ProviderTokenError) {
        return jsonResponse(
          { error: err.errorCode ?? "refresh_failed", message: err.message },
          err.status
        );
      }
      throw err;
    }
  });

  return app;
}

function parseLocalWebReturnUrl(state: string) {
  const encodedPayload = state.split(".")[1];
  if (!encodedPayload) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as {
      web_redirect_uri?: unknown;
    };
    if (typeof payload.web_redirect_uri !== "string") {
      return null;
    }

    const url = new URL(payload.web_redirect_uri);
    const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (!isLocalhost || url.protocol !== "http:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.length % 4 === 0 ? normalized : normalized + "=".repeat(4 - (normalized.length % 4));
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
