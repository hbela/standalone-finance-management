import {
  TinkAuthError,
  refreshTinkAccessToken,
  type TinkTokenResponse
} from "./tinkClient.js";
import {
  readProviderTokens,
  updateProviderTokens,
  type ProviderTokenSet
} from "./tokenVault.js";

const REFRESH_LEEWAY_MS = 60_000;

type SessionLogger = {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
};

export async function withTinkAccessToken<T>(
  tokenRef: string,
  fn: (accessToken: string, tokens: ProviderTokenSet) => Promise<T>,
  log?: SessionLogger
): Promise<T> {
  let tokens = await readProviderTokens(tokenRef);
  let refreshed = false;

  if (shouldRefreshProactively(tokens)) {
    if (!tokens.refreshToken) {
      throw new TinkAuthError("Access token expired and no refresh token available", 401);
    }

    tokens = await rotate(tokenRef, tokens, log, "proactive");
    refreshed = true;
  }

  try {
    return await fn(tokens.accessToken, tokens);
  } catch (error) {
    if (!(error instanceof TinkAuthError) || refreshed) {
      throw error;
    }

    if (!tokens.refreshToken) {
      throw error;
    }

    tokens = await rotate(tokenRef, tokens, log, "on-401");

    return await fn(tokens.accessToken, tokens);
  }
}

function shouldRefreshProactively(tokens: ProviderTokenSet) {
  if (!tokens.expiresAt) {
    return false;
  }

  return tokens.expiresAt - REFRESH_LEEWAY_MS < Date.now();
}

async function rotate(
  tokenRef: string,
  current: ProviderTokenSet,
  log: SessionLogger | undefined,
  reason: "proactive" | "on-401"
) {
  if (!current.refreshToken) {
    throw new TinkAuthError("Cannot refresh without refresh token", 401);
  }

  log?.info(
    {
      provider: current.provider,
      reason,
      expiresAt: current.expiresAt
    },
    "tink token refresh"
  );

  let response: TinkTokenResponse;
  try {
    response = await refreshTinkAccessToken({ refreshToken: current.refreshToken });
  } catch (error) {
    log?.warn(
      {
        provider: current.provider,
        reason,
        errorMessage: error instanceof Error ? error.message : "refresh failed"
      },
      "tink token refresh failed"
    );

    throw error;
  }

  const expiresAt = response.expires_in
    ? Date.now() + response.expires_in * 1000
    : undefined;

  const next: ProviderTokenSet = {
    ...current,
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? current.refreshToken,
    tokenType: response.token_type ?? current.tokenType,
    scope: response.scope ?? current.scope,
    expiresAt,
    receivedAt: Date.now()
  };

  await updateProviderTokens(tokenRef, next);

  return next;
}
