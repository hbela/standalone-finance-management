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
  assertTinkConfigured(env);
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
  assertTinkConfigured(env);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: env.TINK_CLIENT_ID,
    client_secret: env.TINK_CLIENT_SECRET,
  });
  return tinkTokenRequest(env, body);
}

async function tinkTokenRequest(env: Env, body: URLSearchParams): Promise<TokenResponse> {
  assertTinkConfigured(env);
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

function assertTinkConfigured(env: Env): asserts env is Env & {
  TINK_CLIENT_ID: string;
  TINK_CLIENT_SECRET: string;
  TINK_REDIRECT_URI: string;
} {
  if (!env.TINK_CLIENT_ID || !env.TINK_CLIENT_SECRET || !env.TINK_REDIRECT_URI) {
    throw new ProviderConfigError("Tink OAuth is not configured for this bridge deployment");
  }
}

async function parseTokenResponse(response: Response, label: string): Promise<TokenResponse> {
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (!response.ok) {
    const message =
      payload && typeof payload === "object"
        ? typeof payload.error_description === "string"
          ? payload.error_description
          : typeof payload.errorMessage === "string"
            ? payload.errorMessage
            : typeof payload.error === "string"
              ? payload.error
              : `${label} token request failed with ${response.status}`
        : `${label} token request failed with ${response.status}`;
    const errorCode =
      payload && typeof payload.errorCode === "string"
        ? payload.errorCode
        : payload && typeof payload.error === "string"
          ? payload.error
          : undefined;
    throw new ProviderTokenError(String(message), response.status, errorCode);
  }

  if (!payload || typeof payload.access_token !== "string") {
    throw new ProviderTokenError(`${label} returned invalid token response`, 502);
  }

  return payload as TokenResponse;
}
