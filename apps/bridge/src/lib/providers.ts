import type { Env } from "../env.js";

export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
};

export class ProviderTokenError extends Error {
  status: number;
  errorCode?: string;
  constructor(message: string, status: number, errorCode?: string) {
    super(message);
    this.name = "ProviderTokenError";
    this.status = status;
    this.errorCode = errorCode;
  }
}

export class ProviderConfigError extends ProviderTokenError {
  constructor(message: string) {
    super(message, 501, "provider_not_configured");
    this.name = "ProviderConfigError";
  }
}

export async function exchangeTinkAuthorizationCode(env: Env, code: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: env.TINK_CLIENT_ID,
    client_secret: env.TINK_CLIENT_SECRET,
    redirect_uri: env.TINK_REDIRECT_URI,
  });
  return tinkTokenRequest(env, body);
}

export async function refreshTinkAccessToken(env: Env, refreshToken: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: env.TINK_CLIENT_ID,
    client_secret: env.TINK_CLIENT_SECRET,
  });
  return tinkTokenRequest(env, body);
}

async function tinkTokenRequest(env: Env, body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(`${env.TINK_API_BASE_URL}/api/v1/oauth/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  return parseTokenResponse(response, "Tink");
}

export async function exchangeWiseAuthorizationCode(env: Env, code: string): Promise<TokenResponse> {
  assertWiseConfigured(env);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: env.WISE_REDIRECT_URI,
  });
  return wiseTokenRequest(env, body);
}

export async function refreshWiseAccessToken(env: Env, refreshToken: string): Promise<TokenResponse> {
  assertWiseConfigured(env);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  return wiseTokenRequest(env, body);
}

async function wiseTokenRequest(env: Env, body: URLSearchParams): Promise<TokenResponse> {
  assertWiseConfigured(env);
  const auth = `Basic ${btoa(`${env.WISE_CLIENT_ID}:${env.WISE_CLIENT_SECRET}`)}`;
  const response = await fetch(`${env.WISE_API_BASE_URL}/oauth/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: auth,
    },
    body,
  });
  return parseTokenResponse(response, "Wise");
}

function assertWiseConfigured(env: Env): asserts env is Env & {
  WISE_CLIENT_ID: string;
  WISE_CLIENT_SECRET: string;
  WISE_REDIRECT_URI: string;
} {
  if (!env.WISE_CLIENT_ID || !env.WISE_CLIENT_SECRET || !env.WISE_REDIRECT_URI) {
    throw new ProviderConfigError("Wise OAuth is not configured for this bridge deployment");
  }
}

async function parseTokenResponse(response: Response, label: string): Promise<TokenResponse> {
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (!response.ok) {
    const message =
      payload && typeof payload === "object"
        ? typeof payload.error_description === "string"
          ? payload.error_description
          : typeof payload.error === "string"
            ? payload.error
            : `${label} token request failed with ${response.status}`
        : `${label} token request failed with ${response.status}`;
    const errorCode =
      payload && typeof payload.error === "string" ? payload.error : undefined;
    throw new ProviderTokenError(String(message), response.status, errorCode);
  }

  if (!payload || typeof payload.access_token !== "string") {
    throw new ProviderTokenError(`${label} returned invalid token response`, 502);
  }

  return payload as TokenResponse;
}
