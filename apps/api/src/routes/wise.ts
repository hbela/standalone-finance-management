import type { FastifyBaseLogger, FastifyInstance } from "fastify";

import { requireUserId } from "../auth.js";
import { config } from "../config.js";
import { convexApi, getConvexClient } from "../convexClient.js";
import { sendNotConfigured } from "../errors.js";
import { getFxSnapshot, type FxBaseCurrency } from "../fxRates.js";
import {
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

    return {
      connected: connection?.status === "connected",
      configured: true,
      environment: config.wiseEnvironment,
      authMode: config.wisePersonalToken ? "personal_token" : "oauth",
      connection
    };
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

    await convex.mutation(convexApi.providerConnections.apiDisconnectConnection, {
      apiSecret: config.apiServiceSecret,
      clerkUserId: userId,
      provider: "wise"
    });

    return { provider: "wise", disconnected: true };
  });
}

function isWiseConfigured() {
  return Boolean(config.wisePersonalToken || (config.wiseClientId && config.wiseClientSecret));
}

async function resolveWiseAccessToken(_clerkUserId: string, _log: FastifyBaseLogger) {
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
