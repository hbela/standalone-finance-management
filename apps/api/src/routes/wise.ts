import type { FastifyBaseLogger, FastifyInstance } from "fastify";

import { requireUserId } from "../auth.js";
import { config } from "../config.js";
import { convexApi, getConvexClient } from "../convexClient.js";
import { sendNotConfigured } from "../errors.js";
import { getFxSnapshot, type FxBaseCurrency } from "../fxRates.js";
import { createWiseState, hashOAuthState, verifyWiseState } from "../oauthState.js";
import { storeProviderTokens, deleteProviderTokens } from "../tokenVault.js";
import { withWiseAccessToken } from "../wiseSession.js";
import {
  exchangeWiseAuthorizationCode,
  listWiseBalances,
  listWiseProfiles,
  listWiseStatement,
  WiseAuthError,
  type WiseBalance,
  type WiseProfile,
  type WiseStatementTransaction
} from "../wiseClient.js";
import {
  normalizeWiseAccounts,
  normalizeWiseTransactions,
  type NormalizedWiseAccount,
  type NormalizedWiseTransaction,
  type WiseBalanceWithProfile,
  type WiseStatementWithContext
} from "../wiseNormalize.js";

const SUPPORTED_COUNTRIES = new Set(["HU", "FR", "GB"]);
const DEFAULT_WISE_SCOPES = ["transfers"];

type ProviderConnectionRecord = {
  connectionId: string;
  status: string;
  scopes?: string[];
  externalUserId?: string;
  tokenRef?: string;
  lastSyncedAt?: number;
  lastSyncStatus?: string;
  lastError?: string;
  lastErrorCode?: string;
  updatedAt?: number;
};

export async function registerWiseRoutes(app: FastifyInstance) {
  app.get("/integrations/wise/status", async (request, reply) => {
    const userId = requireUserId(request, reply);
    if (!userId) return reply;

    if (!isWiseConfigured()) {
      return {
        connected: false,
        configured: false,
        environment: config.wiseEnvironment,
        message:
          "Wise is not fully configured. Set WISE_PERSONAL_TOKEN (sandbox) or WISE_CLIENT_ID/WISE_CLIENT_SECRET (production OAuth)."
      };
    }

    const convex = getConvexClient();
    if (!convex || !config.apiServiceSecret) {
      return {
        connected: false,
        configured: true,
        environment: config.wiseEnvironment,
        message: "Convex is not configured."
      };
    }

    const connection = (await convex.query(
      convexApi.providerConnections.apiGetConnectionForUser,
      {
        apiSecret: config.apiServiceSecret,
        clerkUserId: userId,
        provider: "wise"
      }
    )) as ProviderConnectionRecord | null;

    const authMode: "oauth" | "personal_token" | "unconfigured" = connection?.tokenRef
      ? "oauth"
      : config.wisePersonalToken
        ? "personal_token"
        : "unconfigured";

    return {
      connected: connection?.status === "connected",
      configured: true,
      environment: config.wiseEnvironment,
      authMode,
      oauthAvailable: Boolean(
        config.wiseClientId &&
          config.wiseClientSecret &&
          config.wiseRedirectUri &&
          config.oauthStateSecret
      ),
      connection
    };
  });

  app.get("/integrations/wise/connect", async (request, reply) => {
    const userId = requireUserId(request, reply);
    if (!userId) return reply;

    if (
      !config.wiseClientId ||
      !config.wiseClientSecret ||
      !config.wiseRedirectUri ||
      !config.oauthStateSecret ||
      !config.apiServiceSecret
    ) {
      return sendNotConfigured(
        reply,
        "Wise",
        "Set WISE_CLIENT_ID, WISE_CLIENT_SECRET, WISE_REDIRECT_URI, OAUTH_STATE_SECRET, and API_SERVICE_SECRET to enable OAuth."
      );
    }

    const convex = getConvexClient();
    if (!convex) return sendNotConfigured(reply, "Convex");

    const country = SUPPORTED_COUNTRIES.has(config.tinkMarket) ? config.tinkMarket : "HU";
    const state = createWiseState(config.oauthStateSecret, { clerkUserId: userId });
    const stateHash = hashOAuthState(state);

    await convex.mutation(convexApi.providerConnections.apiRecordConnectionStarted, {
      apiSecret: config.apiServiceSecret,
      clerkUserId: userId,
      provider: "wise",
      country,
      scopes: DEFAULT_WISE_SCOPES,
      stateHash
    });

    const authorizeUrl = new URL(`${config.wiseAuthBaseUrl}/oauth/authorize`);
    authorizeUrl.searchParams.set("client_id", config.wiseClientId);
    authorizeUrl.searchParams.set("redirect_uri", config.wiseRedirectUri);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("state", state);

    return { url: authorizeUrl.toString() };
  });

  app.get<{
    Querystring: { code?: string; state?: string; error?: string; error_description?: string };
  }>("/integrations/wise/callback", async (request, reply) => {
    const { code, state, error, error_description: errorDescription } = request.query;

    if (!config.appRedirectUrl) {
      return reply.code(503).send({
        error: "not_configured",
        message: "APP_REDIRECT_URL is not configured."
      });
    }

    const finishRedirect = (params: Record<string, string>) => {
      const target = new URL(config.appRedirectUrl);
      target.searchParams.set("provider", "wise");
      for (const [key, value] of Object.entries(params)) {
        target.searchParams.set(key, value);
      }
      return reply.redirect(target.toString());
    };

    if (error) {
      request.log.warn(
        { provider: "wise", error, errorDescription },
        "wise oauth callback returned error"
      );
      return finishRedirect({
        status: "error",
        errorCode: error,
        errorMessage: errorDescription ?? ""
      });
    }

    if (!code || !state) {
      return finishRedirect({
        status: "error",
        errorCode: "missing_code_or_state",
        errorMessage: "Wise callback missing code or state."
      });
    }

    if (
      !config.oauthStateSecret ||
      !config.wiseClientId ||
      !config.wiseClientSecret ||
      !config.wiseRedirectUri ||
      !config.apiServiceSecret
    ) {
      return finishRedirect({
        status: "error",
        errorCode: "wise_not_configured",
        errorMessage: "Wise OAuth credentials are not configured on the server."
      });
    }

    const convex = getConvexClient();
    if (!convex) {
      return finishRedirect({
        status: "error",
        errorCode: "convex_not_configured",
        errorMessage: "Convex is not configured."
      });
    }

    let statePayload;
    try {
      statePayload = verifyWiseState(state, config.oauthStateSecret);
    } catch (err) {
      const message = err instanceof Error ? err.message : "invalid state";
      request.log.warn({ provider: "wise", message }, "wise oauth state verification failed");
      return finishRedirect({
        status: "error",
        errorCode: "invalid_state",
        errorMessage: message
      });
    }

    if (!statePayload.clerkUserId) {
      return finishRedirect({
        status: "error",
        errorCode: "invalid_state",
        errorMessage: "Wise state missing Clerk user binding."
      });
    }

    const stateHash = hashOAuthState(state);

    let tokens;
    try {
      tokens = await exchangeWiseAuthorizationCode({
        code,
        redirectUri: config.wiseRedirectUri
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "wise token exchange failed";
      request.log.warn({ provider: "wise", message }, "wise oauth code exchange failed");
      await convex.mutation(convexApi.providerConnections.apiMarkConnectionFailed, {
        apiSecret: config.apiServiceSecret,
        provider: "wise",
        stateHash,
        errorMessage: message
      });
      return finishRedirect({
        status: "error",
        errorCode: "token_exchange_failed",
        errorMessage: message
      });
    }

    const tokenRef = await storeProviderTokens(
      {
        provider: "wise",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenType: tokens.token_type,
        scope: tokens.scope,
        expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
        externalUserId: tokens.user_id ? String(tokens.user_id) : undefined,
        receivedAt: Date.now()
      },
      { clerkUserId: statePayload.clerkUserId }
    );

    await convex.mutation(convexApi.providerConnections.apiMarkConnectionCompleted, {
      apiSecret: config.apiServiceSecret,
      provider: "wise",
      stateHash,
      externalUserId: tokens.user_id ? String(tokens.user_id) : undefined,
      tokenRef,
      scopes: tokens.scope ? tokens.scope.split(" ").filter(Boolean) : DEFAULT_WISE_SCOPES,
      expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined
    });

    return finishRedirect({ status: "success" });
  });

  app.post("/integrations/wise/sync", async (request, reply) => {
    const userId = requireUserId(request, reply);
    if (!userId) return reply;

    if (!isWiseConfigured()) {
      return sendNotConfigured(
        reply,
        "Wise",
        "Set WISE_PERSONAL_TOKEN (sandbox) or finish OAuth setup."
      );
    }

    const convex = getConvexClient();
    if (!convex || !config.apiServiceSecret) {
      return sendNotConfigured(reply, "Convex");
    }

    const accessToken = await resolveWiseAccessToken(userId, request.log);
    if (!accessToken) {
      return reply.code(503).send({
        error: "wise_token_unavailable",
        message: "No Wise access token available for this user."
      });
    }

    const country = SUPPORTED_COUNTRIES.has(config.tinkMarket) ? config.tinkMarket : "HU";

    await convex.mutation(convexApi.providerConnections.apiEnsureProviderConnection, {
      apiSecret: config.apiServiceSecret,
      clerkUserId: userId,
      provider: "wise",
      country,
      scopes: ["transfers", "balances", "statements"]
    });

    const baseCurrency = await resolveBaseCurrency(convex, userId, request.log);
    const fxSnapshot = await getFxSnapshot(baseCurrency, request.log);

    let profiles: WiseProfile[];
    try {
      profiles = await listWiseProfiles(accessToken);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "wise profiles fetch failed";
      await convex.mutation(convexApi.providerConnections.apiMarkSyncStatus, {
        apiSecret: config.apiServiceSecret,
        clerkUserId: userId,
        provider: "wise",
        status: "failed",
        lastError: errorMessage
      });
      if (error instanceof WiseAuthError) {
        await convex.mutation(convexApi.providerConnections.apiMarkConnectionReconnectRequired, {
          apiSecret: config.apiServiceSecret,
          clerkUserId: userId,
          provider: "wise",
          errorCode: String(error.status),
          errorMessage
        });
        return reply.code(409).send({
          error: "wise_reconnect_required",
          message: errorMessage
        });
      }
      throw error;
    }

    const balanceEntries: WiseBalanceWithProfile[] = [];
    for (const profile of profiles) {
      try {
        const balances = await listWiseBalances(accessToken, profile.id);
        for (const balance of balances) {
          balanceEntries.push({ profile, balance });
        }
      } catch (error) {
        request.log.warn(
          {
            provider: "wise",
            profileId: profile.id,
            errorMessage: error instanceof Error ? error.message : "wise balances fetch failed"
          },
          "wise balances fetch failed for profile"
        );
      }
    }

    const accountSync = normalizeWiseAccounts(balanceEntries);
    const accountResult = (await convex.mutation(
      convexApi.accounts.apiUpsertProviderAccounts,
      {
        apiSecret: config.apiServiceSecret,
        clerkUserId: userId,
        provider: "wise",
        accounts: accountSync.accounts
      }
    )) as {
      createdCount: number;
      updatedCount: number;
      upsertedAccounts: Array<{ providerAccountId: string; accountId: string }>;
    };

    const intervalEnd = new Date().toISOString();
    const intervalStart = new Date(
      Date.now() - config.wiseLookbackDays * 24 * 60 * 60 * 1000
    ).toISOString();

    const statements: WiseStatementWithContext[] = [];
    for (const entry of balanceEntries) {
      try {
        const statement = await listWiseStatement(accessToken, {
          profileId: entry.profile.id,
          balanceId: entry.balance.id,
          currency: entry.balance.amount?.currency ?? entry.balance.currency,
          intervalStart,
          intervalEnd
        });
        statements.push({
          profile: entry.profile,
          balance: entry.balance,
          transactions: statement.transactions ?? []
        });
      } catch (error) {
        request.log.warn(
          {
            provider: "wise",
            profileId: entry.profile.id,
            balanceId: entry.balance.id,
            errorMessage: error instanceof Error ? error.message : "wise statement fetch failed"
          },
          "wise statement fetch failed for balance"
        );
      }
    }

    const transactionSync = normalizeWiseTransactions(statements, fxSnapshot);
    const transactionResult = (await convex.mutation(
      convexApi.transactions.apiImportProviderTransactions,
      {
        apiSecret: config.apiServiceSecret,
        clerkUserId: userId,
        provider: "wise",
        transactions: transactionSync.transactions
      }
    )) as { imported: number; updated: number; skipped: number };

    await convex.mutation(convexApi.providerConnections.apiMarkSyncStatus, {
      apiSecret: config.apiServiceSecret,
      clerkUserId: userId,
      provider: "wise",
      status: "success"
    });

    return {
      provider: "wise",
      profileCount: profiles.length,
      balanceCount: balanceEntries.length,
      accountSync: {
        accounts: accountSync.accounts.length,
        skipped: accountSync.skippedCount,
        skipReasons: accountSync.skipReasons
      },
      accountResult,
      transactionSync: {
        prepared: transactionSync.transactions.length,
        skipped: transactionSync.skippedCount,
        skipReasons: transactionSync.skipReasons
      },
      transactionResult
    };
  });

  app.post("/integrations/wise/disconnect", async (request, reply) => {
    const userId = requireUserId(request, reply);
    if (!userId) return reply;

    const convex = getConvexClient();
    if (!convex || !config.apiServiceSecret) {
      return sendNotConfigured(reply, "Convex");
    }

    const result = (await convex.mutation(
      convexApi.providerConnections.apiDisconnectConnection,
      {
        apiSecret: config.apiServiceSecret,
        clerkUserId: userId,
        provider: "wise"
      }
    )) as { tokenRef?: string } | null;

    if (result?.tokenRef) {
      try {
        await deleteProviderTokens(result.tokenRef);
      } catch (err) {
        request.log.warn(
          {
            provider: "wise",
            errorMessage: err instanceof Error ? err.message : "vault delete failed"
          },
          "wise vault token deletion failed during disconnect"
        );
      }
    }

    return { provider: "wise", disconnected: true };
  });
}

function isWiseConfigured() {
  return Boolean(config.wisePersonalToken || (config.wiseClientId && config.wiseClientSecret));
}

async function resolveWiseAccessToken(clerkUserId: string, log: FastifyBaseLogger) {
  const convex = getConvexClient();
  if (convex && config.apiServiceSecret) {
    const connection = (await convex.query(
      convexApi.providerConnections.apiGetConnectionForUser,
      {
        apiSecret: config.apiServiceSecret,
        clerkUserId,
        provider: "wise"
      }
    )) as ProviderConnectionRecord | null;

    if (connection?.tokenRef && connection.status !== "disconnected" && connection.status !== "revoked") {
      try {
        return await withWiseAccessToken(
          connection.tokenRef,
          async (accessToken) => accessToken,
          log
        );
      } catch (err) {
        log.warn(
          {
            provider: "wise",
            errorMessage: err instanceof Error ? err.message : "vault token unavailable"
          },
          "wise vault token resolution failed; falling back to personal token if configured"
        );
      }
    }
  }

  if (config.wisePersonalToken) {
    return config.wisePersonalToken;
  }
  return null;
}

async function resolveBaseCurrency(
  convex: NonNullable<ReturnType<typeof getConvexClient>>,
  clerkUserId: string,
  log: FastifyBaseLogger
): Promise<FxBaseCurrency> {
  if (!config.apiServiceSecret) return "EUR";
  try {
    const result = (await convex.query(convexApi.users.apiGetUserBaseCurrency, {
      apiSecret: config.apiServiceSecret,
      clerkUserId
    })) as { baseCurrency: FxBaseCurrency } | null;
    return result?.baseCurrency ?? "EUR";
  } catch (error) {
    log.warn(
      {
        provider: "wise",
        errorMessage: error instanceof Error ? error.message : "base currency lookup failed"
      },
      "wise base currency lookup failed"
    );
    return "EUR";
  }
}

export const wiseRouteInternals = {
  isWiseConfigured,
  resolveWiseAccessToken,
  resolveBaseCurrency
};
