import type { FastifyInstance } from "fastify";

import { requireUserId } from "../auth.js";
import { config } from "../config.js";
import { convexApi, getConvexClient } from "../convexClient.js";
import { sendNotConfigured } from "../errors.js";
import { createTinkState, hashOAuthState, verifyTinkState } from "../oauthState.js";
import {
  exchangeTinkAuthorizationCode,
  listTinkAccounts,
  listTinkTransactions,
  parseTinkAmountValue,
  type TinkAccount,
  type TinkTransaction
} from "../tinkClient.js";
import { deleteProviderTokens, readProviderTokens, storeProviderTokens } from "../tokenVault.js";

type SupportedCurrency = "HUF" | "EUR" | "USD" | "GBP";
type AccountType = "checking" | "savings" | "credit" | "loan" | "mortgage";
type TransactionType = "expense" | "income" | "fee" | "refund";

type ConvexProviderConnection = {
  status: string;
  scopes?: string[];
  tokenRef?: string;
  lastSyncedAt?: number;
  lastSyncStatus?: string;
  lastError?: string;
  updatedAt?: number;
};

export async function registerTinkRoutes(app: FastifyInstance) {
  app.get("/integrations/tink/status", async (request, reply) => {
    const userId = requireUserId(request, reply);

    if (!userId) {
      return reply;
    }

    if (!config.apiServiceSecret) {
      return sendNotConfigured(reply, "Tink");
    }

    const convex = getConvexClient();
    if (!convex) {
      return sendNotConfigured(reply, "Convex");
    }

    const connection = (await convex.query(
      convexApi.providerConnections.apiGetConnectionForUser,
      {
        apiSecret: config.apiServiceSecret,
        clerkUserId: userId,
        provider: "tink"
      }
    )) as ConvexProviderConnection | null;

    return {
      provider: "tink",
      connected: connection?.status === "connected",
      status: connection?.status ?? "not_connected",
      scopes: connection?.scopes ?? [],
      lastSyncedAt: connection?.lastSyncedAt,
      lastSyncStatus: connection?.lastSyncStatus ?? "never_synced",
      lastError: connection?.lastError,
      updatedAt: connection?.updatedAt
    };
  });

  app.get("/integrations/tink/link", async (request, reply) => {
    const userId = requireUserId(request, reply);

    if (!userId) {
      return reply;
    }

    if (
      !config.tinkClientId ||
      !config.tinkRedirectUri ||
      !config.oauthStateSecret ||
      !config.apiServiceSecret
    ) {
      return sendNotConfigured(reply, "Tink");
    }

    const convex = getConvexClient();
    if (!convex) {
      return sendNotConfigured(reply, "Convex");
    }

    const state = createTinkState(config.oauthStateSecret);
    await convex.mutation(convexApi.providerConnections.apiRecordConnectionStarted, {
      apiSecret: config.apiServiceSecret,
      clerkUserId: userId,
      provider: "tink",
      country: config.tinkMarket,
      scopes: config.tinkScopes,
      stateHash: hashOAuthState(state)
    });

    const url = new URL(config.tinkLinkBaseUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", config.tinkClientId);
    url.searchParams.set("redirect_uri", config.tinkRedirectUri);
    url.searchParams.set("market", config.tinkMarket);
    url.searchParams.set("scope", config.tinkScopes.join(","));
    url.searchParams.set("state", state);

    return {
      provider: "tink",
      market: config.tinkMarket,
      scopes: config.tinkScopes,
      url: url.toString()
    };
  });

  app.get<{
    Querystring: {
      code?: string;
      error?: string;
      error_description?: string;
      state?: string;
    };
  }>("/integrations/tink/callback", async (request, reply) => {
    if (
      !config.oauthStateSecret ||
      !config.apiServiceSecret ||
      !config.tinkClientSecret ||
      !config.tokenEncryptionKey
    ) {
      return sendNotConfigured(reply, "Tink");
    }

    const convex = getConvexClient();
    if (!convex) {
      return sendNotConfigured(reply, "Convex");
    }

    const redirectUrl = new URL(config.appRedirectUrl);
    redirectUrl.pathname = normalizeRedirectPath(redirectUrl.pathname, "bank-connected");
    let stateHash: string | null = null;

    try {
      if (!request.query.state) {
        throw new Error("Missing OAuth state");
      }

      const state = verifyTinkState(request.query.state, config.oauthStateSecret);
      stateHash = hashOAuthState(request.query.state);
      redirectUrl.searchParams.set("provider", state.provider);

      if (request.query.error) {
        await convex.mutation(convexApi.providerConnections.apiMarkConnectionFailed, {
          apiSecret: config.apiServiceSecret,
          provider: state.provider,
          stateHash,
          errorMessage: request.query.error_description ?? request.query.error
        });

        redirectUrl.searchParams.set("status", "failed");
        redirectUrl.searchParams.set("error", request.query.error);
        if (request.query.error_description) {
          redirectUrl.searchParams.set("message", request.query.error_description);
        }

        return reply.redirect(redirectUrl.toString());
      }

      if (!request.query.code) {
        throw new Error("Missing authorization code");
      }

      const tokenResponse = await exchangeTinkAuthorizationCode(request.query.code);
      const expiresAt = tokenResponse.expires_in
        ? Date.now() + tokenResponse.expires_in * 1000
        : undefined;
      const scopes = tokenResponse.scope
        ? tokenResponse.scope.split(/[,\s]+/).filter(Boolean)
        : config.tinkScopes;
      const tokenRef = await storeProviderTokens({
        provider: "tink",
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        tokenType: tokenResponse.token_type,
        scope: tokenResponse.scope,
        expiresAt,
        externalUserId: tokenResponse.user_id,
        receivedAt: Date.now()
      });

      await convex.mutation(convexApi.providerConnections.apiMarkConnectionCompleted, {
        apiSecret: config.apiServiceSecret,
        provider: state.provider,
        stateHash,
        externalUserId: tokenResponse.user_id,
        tokenRef,
        scopes,
        expiresAt
      });

      redirectUrl.searchParams.set("status", "authorized");

      return reply.redirect(redirectUrl.toString());
    } catch (error) {
      if (stateHash) {
        await convex
          .mutation(convexApi.providerConnections.apiMarkConnectionFailed, {
            apiSecret: config.apiServiceSecret,
            provider: "tink",
            stateHash,
            errorMessage: error instanceof Error ? error.message : "Invalid Tink callback"
          })
          .catch(() => undefined);
      }

      redirectUrl.searchParams.set("provider", "tink");
      redirectUrl.searchParams.set("status", "failed");
      redirectUrl.searchParams.set("error", "invalid_callback");
      redirectUrl.searchParams.set(
        "message",
        error instanceof Error ? error.message : "Invalid Tink callback"
      );

      return reply.redirect(redirectUrl.toString());
    }
  });

  app.post("/integrations/tink/sync/accounts", async (request, reply) => {
    const userId = requireUserId(request, reply);

    if (!userId) {
      return reply;
    }

    if (!config.apiServiceSecret || !config.tokenEncryptionKey) {
      return sendNotConfigured(reply, "Tink");
    }

    const convex = getConvexClient();
    if (!convex) {
      return sendNotConfigured(reply, "Convex");
    }

    const connection = (await convex.query(
      convexApi.providerConnections.apiGetConnectionForUser,
      {
        apiSecret: config.apiServiceSecret,
        clerkUserId: userId,
        provider: "tink"
      }
    )) as ConvexProviderConnection | null;

    if (!connection || connection.status !== "connected" || !connection.tokenRef) {
      return reply.code(409).send({
        error: "not_connected",
        message: "Connect Tink before syncing accounts."
      });
    }

    try {
      const tokens = await readProviderTokens(connection.tokenRef);
      const tinkAccounts = await listTinkAccounts(tokens.accessToken);
      const { accounts, skippedCount } = normalizeTinkAccounts(tinkAccounts);
      const result = (await convex.mutation(convexApi.accounts.apiUpsertProviderAccounts, {
        apiSecret: config.apiServiceSecret,
        clerkUserId: userId,
        provider: "tink",
        accounts
      })) as { createdCount: number; updatedCount: number };

      return {
        provider: "tink",
        fetchedCount: tinkAccounts.length,
        importedCount: accounts.length,
        skippedCount,
        ...result
      };
    } catch (error) {
      await convex
        .mutation(convexApi.providerConnections.apiMarkSyncStatus, {
          apiSecret: config.apiServiceSecret,
          clerkUserId: userId,
          provider: "tink",
          status: "failed",
          lastError: error instanceof Error ? error.message : "Tink account sync failed"
        })
        .catch(() => undefined);

      return reply.code(502).send({
        error: "sync_failed",
        message: error instanceof Error ? error.message : "Tink account sync failed"
      });
    }
  });

  app.post("/integrations/tink/sync", async (request, reply) => {
    const userId = requireUserId(request, reply);

    if (!userId) {
      return reply;
    }

    if (!config.apiServiceSecret || !config.tokenEncryptionKey) {
      return sendNotConfigured(reply, "Tink");
    }

    const convex = getConvexClient();
    if (!convex) {
      return sendNotConfigured(reply, "Convex");
    }

    const connection = (await convex.query(
      convexApi.providerConnections.apiGetConnectionForUser,
      {
        apiSecret: config.apiServiceSecret,
        clerkUserId: userId,
        provider: "tink"
      }
    )) as ConvexProviderConnection | null;

    if (!connection || connection.status !== "connected" || !connection.tokenRef) {
      return reply.code(409).send({
        error: "not_connected",
        message: "Connect Tink before syncing."
      });
    }

    try {
      const tokens = await readProviderTokens(connection.tokenRef);
      const tinkAccounts = await listTinkAccounts(tokens.accessToken);
      const accountSync = normalizeTinkAccounts(tinkAccounts);
      const accountResult = (await convex.mutation(
        convexApi.accounts.apiUpsertProviderAccounts,
        {
          apiSecret: config.apiServiceSecret,
          clerkUserId: userId,
          provider: "tink",
          accounts: accountSync.accounts
        }
      )) as { createdCount: number; updatedCount: number };
      const tinkTransactions = await listTinkTransactions(tokens.accessToken, {});
      const transactionSync = normalizeTinkTransactions(tinkTransactions);
      const transactionResult = (await convex.mutation(
        convexApi.transactions.apiImportProviderTransactions,
        {
          apiSecret: config.apiServiceSecret,
          clerkUserId: userId,
          provider: "tink",
          transactions: transactionSync.transactions
        }
      )) as { imported: number; skipped: number };

      return {
        provider: "tink",
        accounts: {
          fetchedCount: tinkAccounts.length,
          importedCount: accountSync.accounts.length,
          skippedCount: accountSync.skippedCount,
          ...accountResult
        },
        transactions: {
          fetchedCount: tinkTransactions.length,
          preparedCount: transactionSync.transactions.length,
          skippedBeforeImportCount: transactionSync.skippedCount,
          importedCount: transactionResult.imported,
          skippedDuringImportCount: transactionResult.skipped
        }
      };
    } catch (error) {
      await convex
        .mutation(convexApi.providerConnections.apiMarkSyncStatus, {
          apiSecret: config.apiServiceSecret,
          clerkUserId: userId,
          provider: "tink",
          status: "partial_failure",
          lastError: error instanceof Error ? error.message : "Tink sync failed"
        })
        .catch(() => undefined);

      return reply.code(502).send({
        error: "sync_failed",
        message: error instanceof Error ? error.message : "Tink sync failed"
      });
    }
  });

  app.post<{
    Body: {
      from?: string;
      to?: string;
    };
  }>("/integrations/tink/sync/transactions", async (request, reply) => {
    const userId = requireUserId(request, reply);

    if (!userId) {
      return reply;
    }

    if (!config.apiServiceSecret || !config.tokenEncryptionKey) {
      return sendNotConfigured(reply, "Tink");
    }

    const convex = getConvexClient();
    if (!convex) {
      return sendNotConfigured(reply, "Convex");
    }

    const connection = (await convex.query(
      convexApi.providerConnections.apiGetConnectionForUser,
      {
        apiSecret: config.apiServiceSecret,
        clerkUserId: userId,
        provider: "tink"
      }
    )) as ConvexProviderConnection | null;

    if (!connection || connection.status !== "connected" || !connection.tokenRef) {
      return reply.code(409).send({
        error: "not_connected",
        message: "Connect Tink before syncing transactions."
      });
    }

    try {
      const tokens = await readProviderTokens(connection.tokenRef);
      const tinkTransactions = await listTinkTransactions(tokens.accessToken, {
        from: request.body?.from,
        to: request.body?.to
      });
      const { transactions, skippedCount } = normalizeTinkTransactions(tinkTransactions);
      const result = (await convex.mutation(
        convexApi.transactions.apiImportProviderTransactions,
        {
          apiSecret: config.apiServiceSecret,
          clerkUserId: userId,
          provider: "tink",
          transactions
        }
      )) as { imported: number; skipped: number };

      return {
        provider: "tink",
        fetchedCount: tinkTransactions.length,
        preparedCount: transactions.length,
        skippedBeforeImportCount: skippedCount,
        importedCount: result.imported,
        skippedDuringImportCount: result.skipped
      };
    } catch (error) {
      await convex
        .mutation(convexApi.providerConnections.apiMarkSyncStatus, {
          apiSecret: config.apiServiceSecret,
          clerkUserId: userId,
          provider: "tink",
          status: "failed",
          lastError: error instanceof Error ? error.message : "Tink transaction sync failed"
        })
        .catch(() => undefined);

      return reply.code(502).send({
        error: "sync_failed",
        message: error instanceof Error ? error.message : "Tink transaction sync failed"
      });
    }
  });

  app.post("/integrations/tink/disconnect", async (request, reply) => {
    const userId = requireUserId(request, reply);

    if (!userId) {
      return reply;
    }

    if (!config.apiServiceSecret) {
      return sendNotConfigured(reply, "Tink");
    }

    const convex = getConvexClient();
    if (!convex) {
      return sendNotConfigured(reply, "Convex");
    }

    const result = (await convex.mutation(
      convexApi.providerConnections.apiDisconnectConnection,
      {
        apiSecret: config.apiServiceSecret,
        clerkUserId: userId,
        provider: "tink"
      }
    )) as { tokenRef?: string } | null;

    if (result?.tokenRef) {
      await deleteProviderTokens(result.tokenRef);
    }

    return {
      provider: "tink",
      status: "disconnected"
    };
  });
}

function normalizeRedirectPath(pathname: string, nextPath: string) {
  if (!pathname || pathname === "/") {
    return nextPath;
  }

  return pathname.endsWith("/") ? `${pathname}${nextPath}` : `${pathname}/${nextPath}`;
}

function normalizeTinkAccounts(accounts: TinkAccount[]) {
  const normalized = [];
  let skippedCount = 0;

  for (const account of accounts) {
    const currency = normalizeCurrency(
      account.currencyCode ??
        account.balances?.booked?.amount?.currencyCode ??
        account.balances?.booked?.currencyCode ??
        account.balance?.amount?.currencyCode ??
        account.balance?.currencyCode
    );

    if (!account.id || !currency) {
      skippedCount += 1;
      continue;
    }

    normalized.push({
      providerAccountId: account.id,
      bankKey: account.financialInstitutionName
        ? `tink:${slugify(account.financialInstitutionName)}`
        : undefined,
      name: account.name?.trim() || account.financialInstitutionName || "Connected bank account",
      currency,
      type: normalizeAccountType(account.type),
      currentBalance:
        parseTinkAmountValue(account.balances?.booked) ??
        parseTinkAmountValue(account.balance) ??
        0
    });
  }

  return { accounts: normalized, skippedCount };
}

function normalizeCurrency(value: string | undefined): SupportedCurrency | null {
  const currency = value?.toUpperCase();

  if (
    currency === "HUF" ||
    currency === "EUR" ||
    currency === "USD" ||
    currency === "GBP"
  ) {
    return currency;
  }

  return null;
}

function normalizeAccountType(value: string | undefined): AccountType {
  const type = value?.toLowerCase() ?? "";

  if (type.includes("saving")) {
    return "savings";
  }

  if (type.includes("credit") || type.includes("card")) {
    return "credit";
  }

  if (type.includes("mortgage")) {
    return "mortgage";
  }

  if (type.includes("loan")) {
    return "loan";
  }

  return "checking";
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeTinkTransactions(transactions: TinkTransaction[]) {
  const normalized = [];
  let skippedCount = 0;

  for (const transaction of transactions) {
    const providerAccountId = transaction.accountId ?? transaction.account?.id;
    const amount = parseTinkAmountValue(transaction.amount);
    const currency = normalizeCurrency(
      transaction.currencyCode ??
        (typeof transaction.amount === "object" ? transaction.amount?.amount?.currencyCode ?? transaction.amount?.currencyCode : undefined)
    );
    const postedAt = parseTinkDate(
      transaction.dates?.booked ?? transaction.bookedDate ?? transaction.dates?.value
    );
    const description =
      transaction.descriptions?.display ??
      transaction.description ??
      transaction.reference ??
      "Tink transaction";

    if (
      !transaction.id ||
      !providerAccountId ||
      amount === null ||
      !currency ||
      postedAt === null ||
      transaction.status?.toLowerCase() === "pending"
    ) {
      skippedCount += 1;
      continue;
    }

    const merchant = transaction.merchantInformation?.merchantName ?? transaction.merchantName;

    normalized.push({
      providerAccountId,
      providerTransactionId: transaction.id,
      postedAt,
      amount,
      currency,
      baseCurrencyAmount: toBaseCurrency(amount, currency),
      description,
      merchant,
      categoryId: transaction.category,
      type: normalizeTransactionType(amount, transaction.category),
      isRecurring: false,
      isExcludedFromReports: false,
      dedupeHash: createProviderDedupeHash({
        providerAccountId,
        providerTransactionId: transaction.id,
        postedAt,
        amount,
        currency,
        description,
        merchant
      })
    });
  }

  return { transactions: normalized, skippedCount };
}

function parseTinkDate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function normalizeTransactionType(amount: number, category: string | undefined): TransactionType {
  const normalizedCategory = category?.toLowerCase() ?? "";

  if (normalizedCategory.includes("fee")) {
    return "fee";
  }

  if (amount > 0 && normalizedCategory.includes("refund")) {
    return "refund";
  }

  return amount < 0 ? "expense" : "income";
}

function toBaseCurrency(amount: number, currency: SupportedCurrency) {
  const rates: Record<SupportedCurrency, number> = {
    EUR: 1,
    HUF: 0.00254,
    USD: 0.93,
    GBP: 1.16
  };

  return amount * rates[currency];
}

function createProviderDedupeHash(input: {
  providerAccountId: string;
  providerTransactionId: string;
  postedAt: number;
  amount: number;
  currency: SupportedCurrency;
  description: string;
  merchant?: string;
}) {
  const day = new Date(input.postedAt).toISOString().slice(0, 10);

  return [
    "tink",
    input.providerAccountId,
    input.providerTransactionId,
    day,
    input.amount.toFixed(2),
    input.currency,
    normalizeText(input.description),
    normalizeText(input.merchant ?? "")
  ].join("|");
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const tinkRouteInternals = {
  createProviderDedupeHash,
  normalizeAccountType,
  normalizeCurrency,
  normalizeTinkAccounts,
  normalizeTinkTransactions,
  normalizeTransactionType,
  parseTinkDate
};
