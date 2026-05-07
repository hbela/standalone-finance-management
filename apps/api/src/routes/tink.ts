import type { FastifyBaseLogger, FastifyInstance } from "fastify";

import { requireUserId } from "../auth.js";
import { config } from "../config.js";
import { convexApi, getConvexClient } from "../convexClient.js";
import { sendNotConfigured } from "../errors.js";
import { createTinkState, hashOAuthState, verifyTinkState } from "../oauthState.js";
import {
  createTinkAuthorization,
  createTinkUser,
  exchangeTinkAuthorizationCode,
  listTinkCredentials,
  listTinkAccounts,
  listTinkProviderConsents,
  listTinkTransactions,
  parseTinkAmountValue,
  refreshTinkCredentials,
  TinkRefreshRequiresUserError,
  type TinkAccount,
  type TinkTransaction
} from "../tinkClient.js";
import { deleteProviderTokens, storeProviderTokens } from "../tokenVault.js";
import { withTinkAccessToken } from "../tinkSession.js";
import {
  aggregateCredentialStates,
  type AggregatedCredentialState
} from "../tinkCredentialState.js";
import { pickPrimaryProviderConsent } from "../tinkConsent.js";
import { buildTinkCredentialRows } from "../tinkCredentialMapping.js";
import {
  getFxSnapshot,
  toBaseCurrencyAmount,
  type FxBaseCurrency,
  type FxSnapshot
} from "../fxRates.js";
import { mapTinkCategoryCode } from "../tinkCategoryMapping.js";

type SupportedCurrency = "HUF" | "EUR" | "USD" | "GBP";
type AccountType = "checking" | "savings" | "credit" | "loan" | "mortgage";
type TransactionType = "expense" | "income" | "fee" | "refund";

type ConvexProviderConnection = {
  status: string;
  scopes?: string[];
  tokenRef?: string;
  externalUserId?: string;
  lastSyncedAt?: number;
  lastSyncStatus?: string;
  lastError?: string;
  lastErrorCode?: string;
  consentExpiresAt?: number;
  credentialsId?: string;
  institutionName?: string;
  updatedAt?: number;
};

type NormalizedProviderAccount = ReturnType<typeof normalizeTinkAccounts>["accounts"][number];

type UpsertProviderAccountsResult = {
  createdCount: number;
  updatedCount: number;
  upsertedAccounts: Array<{ providerAccountId: string; accountId: string }>;
};

class TinkReconnectRequiredError extends Error {
  constructor(public readonly state: AggregatedCredentialState) {
    super(`Tink credential requires reconnect: ${state.code ?? "unknown"}`);
    this.name = "TinkReconnectRequiredError";
  }
}

const tinkLinkConnectMoreAccountsBaseUrl =
  "https://link.tink.com/1.0/transactions/connect-more-accounts";

const tinkLinkExtendConsentBaseUrl =
  "https://link.tink.com/1.0/transactions/extend-consent";

const tinkLinkUpdateConsentBaseUrl =
  "https://link.tink.com/1.0/transactions/update-consent";

export async function registerTinkRoutes(app: FastifyInstance) {
  app.get("/integrations/tink/status", async (request, reply) => {
    request.log.info(
      {
        origin: request.headers.origin,
        referer: request.headers.referer,
        secFetchDest: request.headers["sec-fetch-dest"],
        secFetchMode: request.headers["sec-fetch-mode"],
        secFetchSite: request.headers["sec-fetch-site"],
        userAgent: request.headers["user-agent"]
      },
      "tink status caller"
    );

    const userId = requireUserId(request, reply);

    if (!userId) {
      return reply;
    }

    if (!config.apiServiceSecret) {
      return sendNotConfigured(reply, "Tink", getMissingEnvDetail(["API_SERVICE_SECRET"]));
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
      !config.tinkClientSecret ||
      !config.tinkRedirectUri ||
      !config.oauthStateSecret ||
      !config.apiServiceSecret
    ) {
      return sendNotConfigured(
        reply,
        "Tink",
        getMissingEnvDetail([
          "TINK_CLIENT_ID",
          "TINK_CLIENT_SECRET",
          "TINK_REDIRECT_URI",
          "OAUTH_STATE_SECRET",
          "API_SERVICE_SECRET"
        ])
      );
    }

    const convex = getConvexClient();
    if (!convex) {
      return sendNotConfigured(reply, "Convex");
    }

    const existingConnection = (await convex.query(
      convexApi.providerConnections.apiGetConnectionForUser,
      {
        apiSecret: config.apiServiceSecret,
        clerkUserId: userId,
        provider: "tink"
      }
    )) as ConvexProviderConnection | null;

    request.log.info(
      {
        provider: "tink",
        market: config.tinkMarket,
        locale: config.tinkLocale,
        testMode: config.tinkTestMode,
        linkBaseUrl: config.tinkLinkBaseUrl,
        redirectUri: config.tinkRedirectUri,
        inputProvider: config.tinkInputProvider,
        hasInputUsername: Boolean(config.tinkInputUsername),
        useInputPrefill: config.tinkUseInputPrefill,
        useExistingUser: config.tinkUseExistingUser,
        linkAuthMode: config.tinkLinkAuthMode,
        dataScopes: config.tinkScopes,
        hasStoredTinkUserId: Boolean(existingConnection?.externalUserId)
      },
      "tink link start"
    );

    let tinkUserId: string | undefined;
    let linkAuthorizationCode: string | undefined;
    const hasExistingCredentials = Boolean(existingConnection?.tokenRef);

    if (config.tinkUseExistingUser) {
      tinkUserId = existingConnection?.externalUserId;

      if (!tinkUserId) {
        const externalUserId = `wise-finance:${userId}`;
        const tinkUser = await createTinkUser({
          externalUserId,
          market: config.tinkMarket,
          locale: config.tinkLocale
        });

        tinkUserId = tinkUser.user_id;

        request.log.info(
          {
            provider: "tink",
            tinkUserId,
            externalUserIdSuffix: externalUserId.slice(-12)
          },
          "tink link user created"
        );
      } else {
        request.log.info(
          { provider: "tink", tinkUserId, hasExistingCredentials },
          "tink link reusing stored user"
        );
      }

      if (hasExistingCredentials) {
        const linkAuthorization = await createTinkAuthorization({
          userId: tinkUserId,
          scopes: config.tinkScopes,
          idHint: `wise-finance:${userId.slice(-12)}`,
          delegateToClient: true
        });

        linkAuthorizationCode = linkAuthorization.code;

        request.log.info(
          {
            provider: "tink",
            tinkUserId,
            hasAuthorizationCode: Boolean(linkAuthorizationCode),
            authorizationCodeLength: linkAuthorizationCode.length,
            linkAuthMode: config.tinkLinkAuthMode
          },
          "tink link authorization granted"
        );
      }
    }

    const state = createTinkState(config.oauthStateSecret, {
      tinkUserId,
      clerkUserId: userId
    });
    const stateHash = hashOAuthState(state);
    await convex.mutation(convexApi.providerConnections.apiRecordConnectionStarted, {
      apiSecret: config.apiServiceSecret,
      clerkUserId: userId,
      provider: "tink",
      country: config.tinkMarket,
      scopes: config.tinkScopes,
      stateHash,
      externalUserId: tinkUserId
    });

    const linkBaseUrl = linkAuthorizationCode
      ? tinkLinkConnectMoreAccountsBaseUrl
      : config.tinkLinkBaseUrl;
    const url = new URL(linkBaseUrl);
    url.searchParams.set("client_id", config.tinkClientId);
    url.searchParams.set("redirect_uri", config.tinkRedirectUri);
    url.searchParams.set("market", config.tinkMarket);
    url.searchParams.set("locale", config.tinkLocale);
    url.searchParams.set("state", state);
    if (linkAuthorizationCode && config.tinkLinkAuthMode === "token") {
      const linkTokenResponse = await exchangeTinkAuthorizationCode(linkAuthorizationCode);
      url.searchParams.set("authorization_token", linkTokenResponse.access_token);
      request.log.info(
        {
          provider: "tink",
          tinkUserId,
          hasAuthorizationToken: Boolean(linkTokenResponse.access_token),
          authorizationTokenLength: linkTokenResponse.access_token.length,
          authorizationTokenScopes: linkTokenResponse.scope
            ? linkTokenResponse.scope.split(/[,\s]+/).filter(Boolean)
            : undefined
        },
        "tink link authorization token exchanged"
      );
    } else if (linkAuthorizationCode) {
      url.searchParams.set("authorization_code", linkAuthorizationCode);
    } else {
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", config.tinkScopes.join(","));
    }
    if (config.tinkTestMode) {
      url.searchParams.set("test", "true");
    }
    if (config.tinkUseInputPrefill && config.tinkInputProvider) {
      url.searchParams.set("input_provider", config.tinkInputProvider);
    }
    if (config.tinkUseInputPrefill && config.tinkInputUsername) {
      url.searchParams.set("input_username", config.tinkInputUsername);
    }

    request.log.info(
      {
        provider: "tink",
        stateHash,
        tinkUserId,
        linkUrl: sanitizeTinkLinkUrl(url),
        linkUrlParams: getSanitizedTinkLinkParams(url)
      },
      "tink link url built"
    );

    return {
      provider: "tink",
      market: config.tinkMarket,
      locale: config.tinkLocale,
      scopes: config.tinkScopes,
      url: url.toString()
    };
  });

  app.get<{
    Querystring: {
      code?: string;
      credentialsId?: string;
      credentials_id?: string;
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
      return sendNotConfigured(
        reply,
        "Tink",
        getMissingEnvDetail(["OAUTH_STATE_SECRET", "API_SERVICE_SECRET", "TINK_CLIENT_SECRET", "TOKEN_ENCRYPTION_KEY"])
      );
    }

    const convex = getConvexClient();
    if (!convex) {
      return sendNotConfigured(reply, "Convex");
    }

    const redirectUrl = new URL(config.appRedirectUrl);
    redirectUrl.pathname = normalizeRedirectPath(redirectUrl.pathname, "bank-connected");
    let stateHash: string | null = null;

    try {
      request.log.info(
        {
          provider: "tink",
          queryKeys: Object.keys(request.query),
          hasCode: Boolean(request.query.code),
          hasCredentialsId: Boolean(request.query.credentialsId ?? request.query.credentials_id),
          error: request.query.error,
          errorDescription: request.query.error_description
        },
        "tink callback received"
      );

      if (!request.query.state) {
        throw new Error("Missing OAuth state");
      }

      const state = verifyTinkState(request.query.state, config.oauthStateSecret);
      stateHash = hashOAuthState(request.query.state);
      redirectUrl.searchParams.set("provider", state.provider);

      request.log.info(
        {
          provider: "tink",
          stateHash,
          tinkUserId: state.tinkUserId,
          callbackProvidedCode: Boolean(request.query.code)
        },
        "tink callback state verified"
      );

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

      const authorizationCode = state.tinkUserId
        ? (
            await createTinkAuthorization({
              userId: state.tinkUserId,
              scopes: config.tinkScopes
            })
          ).code
        : request.query.code;

      if (!authorizationCode) {
        throw new Error("Missing authorization code");
      }

      request.log.info(
        {
          provider: "tink",
          stateHash,
          usedStateTinkUser: Boolean(state.tinkUserId),
          authorizationCodeLength: authorizationCode.length
        },
        "tink callback data authorization ready"
      );

      const tokenResponse = await exchangeTinkAuthorizationCode(authorizationCode);
      const credentialId = request.query.credentialsId ?? request.query.credentials_id;
      const expiresAt = tokenResponse.expires_in
        ? Date.now() + tokenResponse.expires_in * 1000
        : undefined;
      const scopes = tokenResponse.scope
        ? tokenResponse.scope.split(/[,\s]+/).filter(Boolean)
        : config.tinkScopes;
      if (!state.clerkUserId) {
        throw new Error("OAuth state is missing clerkUserId");
      }

      const tokenRef = await storeProviderTokens(
        {
          provider: "tink",
          accessToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token,
          tokenType: tokenResponse.token_type,
          scope: tokenResponse.scope,
          expiresAt,
          externalUserId: tokenResponse.user_id,
          externalCredentialId: credentialId,
          receivedAt: Date.now()
        },
        { clerkUserId: state.clerkUserId }
      );

      request.log.info(
        {
          provider: "tink",
          credentialId,
          scopes,
          hasRefreshToken: Boolean(tokenResponse.refresh_token),
          externalUserId: tokenResponse.user_id
        },
        "tink callback token stored"
      );

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
      request.log.error(
        {
          provider: "tink",
          stateHash,
          errorMessage: error instanceof Error ? error.message : "Invalid Tink callback"
        },
        "tink callback failed"
      );

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
      return sendNotConfigured(reply, "Tink", getMissingEnvDetail(["API_SERVICE_SECRET", "TOKEN_ENCRYPTION_KEY"]));
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
      const { accounts, skippedCount, fetchedCount, result } = await withTinkAccessToken(
        connection.tokenRef,
        async (accessToken, tokens) => {
          const credentialDiagnostics = await getTinkCredentialDiagnostics(
            accessToken,
            tokens.externalCredentialId,
            request.log
          );
          if (credentialDiagnostics.credentials) {
            const aggregated = aggregateCredentialStates(credentialDiagnostics.credentials);
            if (aggregated.kind === "reconnect_required") {
              request.log.warn(
                {
                  provider: "tink",
                  errorCode: aggregated.code,
                  credentialId: aggregated.credentialId
                },
                "tink account sync gated on credential reconnect_required state"
              );
              throw new TinkReconnectRequiredError(aggregated);
            }
          }

          const tinkAccounts = await listTinkAccounts(accessToken);
          const normalized = normalizeTinkAccounts(tinkAccounts);
          const upsert = (await convex.mutation(convexApi.accounts.apiUpsertProviderAccounts, {
            apiSecret: config.apiServiceSecret,
            clerkUserId: userId,
            provider: "tink",
            accounts: normalized.accounts
          })) as UpsertProviderAccountsResult;
          await persistBalanceSnapshots(
            convex,
            normalized.accounts,
            upsert.upsertedAccounts,
            request.log
          );

          return {
            accounts: normalized.accounts,
            skippedCount: normalized.skippedCount,
            fetchedCount: tinkAccounts.length,
            result: upsert
          };
        },
        request.log
      );

      return {
        provider: "tink",
        fetchedCount,
        importedCount: accounts.length,
        skippedCount,
        createdCount: result.createdCount,
        updatedCount: result.updatedCount
      };
    } catch (error) {
      if (error instanceof TinkReconnectRequiredError) {
        await convex
          .mutation(convexApi.providerConnections.apiMarkConnectionReconnectRequired, {
            apiSecret: config.apiServiceSecret,
            clerkUserId: userId,
            provider: "tink",
            errorCode: error.state.code ?? "RECONNECT_REQUIRED",
            errorMessage: error.message,
            credentialId: error.state.credentialId
          })
          .catch(() => undefined);

        return reply.code(409).send({
          error: "reconnect_required",
          errorCode: error.state.code,
          credentialId: error.state.credentialId,
          message: "Tink credentials need to be re-authorized before syncing."
        });
      }

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
      return sendNotConfigured(reply, "Tink", getMissingEnvDetail(["API_SERVICE_SECRET", "TOKEN_ENCRYPTION_KEY"]));
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
      const fxSnapshot = await resolveFxSnapshot(userId, request.log);
      const summary = await withTinkAccessToken(
        connection.tokenRef,
        async (accessToken, tokens) => {
          const grantedScopes = tokens.scope?.split(/[,\s]+/).filter(Boolean) ?? [];
          const credentialDiagnostics = await getTinkCredentialDiagnostics(
            accessToken,
            tokens.externalCredentialId,
            request.log
          );
          if (credentialDiagnostics.credentials) {
            const aggregated = aggregateCredentialStates(credentialDiagnostics.credentials);
            if (aggregated.kind === "reconnect_required") {
              request.log.warn(
                {
                  provider: "tink",
                  errorCode: aggregated.code,
                  credentialId: aggregated.credentialId
                },
                "tink sync gated on credential reconnect_required state"
              );
              throw new TinkReconnectRequiredError(aggregated);
            }
          }
          const tinkAccounts = await listTinkAccounts(accessToken);
          const accountSync = normalizeTinkAccounts(tinkAccounts);
          const accountResult = (await convex.mutation(
            convexApi.accounts.apiUpsertProviderAccounts,
            {
              apiSecret: config.apiServiceSecret,
              clerkUserId: userId,
              provider: "tink",
              accounts: accountSync.accounts
            }
          )) as UpsertProviderAccountsResult;
          await persistBalanceSnapshots(
            convex,
            accountSync.accounts,
            accountResult.upsertedAccounts,
            request.log
          );
          await captureProviderConsentAndCredentials(
            convex,
            accessToken,
            userId,
            tokens.externalCredentialId,
            credentialDiagnostics.rawCredentials ?? [],
            accountSync.accounts,
            request.log
          );
          const tinkTransactions = await listTinkTransactions(accessToken, {});
          const transactionSync = normalizeTinkTransactions(
            tinkTransactions,
            request.log,
            fxSnapshot
          );
          const transactionResult = (await convex.mutation(
            convexApi.transactions.apiImportProviderTransactions,
            {
              apiSecret: config.apiServiceSecret,
              clerkUserId: userId,
              provider: "tink",
              transactions: transactionSync.transactions
            }
          )) as { imported: number; updated: number; skipped: number };

          await runRecurringDetection(convex, userId, request.log);
          await runIncomeDetection(convex, userId, request.log);
          await runExpenseProfileDetection(convex, userId, request.log);

          return {
            grantedScopes,
            credentialDiagnostics,
            tinkAccounts,
            accountSync,
            accountResult,
            tinkTransactions,
            transactionSync,
            transactionResult
          };
        },
        request.log
      );

      const {
        grantedScopes,
        credentialDiagnostics,
        tinkAccounts,
        accountSync,
        accountResult,
        tinkTransactions,
        transactionSync,
        transactionResult
      } = summary;

      request.log.info(
        {
          provider: "tink",
          token: {
            grantedScopes,
            hasCredentialsRead: grantedScopes.includes("credentials:read"),
            hasUserRead: grantedScopes.includes("user:read"),
            hasAccountsRead: grantedScopes.includes("accounts:read"),
            hasTransactionsRead: grantedScopes.includes("transactions:read")
          },
          credential: credentialDiagnostics,
          accounts: {
            fetchedCount: tinkAccounts.length,
            normalizedCount: accountSync.accounts.length,
            skippedCount: accountSync.skippedCount
          },
          transactions: {
            fetchedCount: tinkTransactions.length,
            normalizedCount: transactionSync.transactions.length,
            skippedCount: transactionSync.skippedCount,
            skipReasons: transactionSync.skipReasons
          },
          fx: {
            base: fxSnapshot.base,
            source: fxSnapshot.source,
            fetchedAt: fxSnapshot.fetchedAt
          }
        },
        "tink sync fetched data"
      );

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
      if (error instanceof TinkReconnectRequiredError) {
        await convex
          .mutation(convexApi.providerConnections.apiMarkConnectionReconnectRequired, {
            apiSecret: config.apiServiceSecret,
            clerkUserId: userId,
            provider: "tink",
            errorCode: error.state.code ?? "RECONNECT_REQUIRED",
            errorMessage: error.message,
            credentialId: error.state.credentialId
          })
          .catch(() => undefined);

        return reply.code(409).send({
          error: "reconnect_required",
          errorCode: error.state.code,
          credentialId: error.state.credentialId,
          message: "Tink credentials need to be re-authorized before syncing."
        });
      }

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
      return sendNotConfigured(reply, "Tink", getMissingEnvDetail(["API_SERVICE_SECRET", "TOKEN_ENCRYPTION_KEY"]));
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
      const fxSnapshot = await resolveFxSnapshot(userId, request.log);
      const outcome = await withTinkAccessToken(
        connection.tokenRef,
        async (accessToken, tokens) => {
          const credentialDiagnostics = await getTinkCredentialDiagnostics(
            accessToken,
            tokens.externalCredentialId,
            request.log
          );
          if (credentialDiagnostics.credentials) {
            const aggregated = aggregateCredentialStates(credentialDiagnostics.credentials);
            if (aggregated.kind === "reconnect_required") {
              request.log.warn(
                {
                  provider: "tink",
                  errorCode: aggregated.code,
                  credentialId: aggregated.credentialId
                },
                "tink transaction sync gated on credential reconnect_required state"
              );
              throw new TinkReconnectRequiredError(aggregated);
            }
          }

          const tinkTransactions = await listTinkTransactions(accessToken, {
            from: request.body?.from,
            to: request.body?.to
          });
          const { transactions, skippedCount } = normalizeTinkTransactions(
            tinkTransactions,
            request.log,
            fxSnapshot
          );
          const result = (await convex.mutation(
            convexApi.transactions.apiImportProviderTransactions,
            {
              apiSecret: config.apiServiceSecret,
              clerkUserId: userId,
              provider: "tink",
              transactions
            }
          )) as { imported: number; updated: number; skipped: number };

          await runRecurringDetection(convex, userId, request.log);
          await runIncomeDetection(convex, userId, request.log);
          await runExpenseProfileDetection(convex, userId, request.log);

          return {
            tinkTransactions,
            transactions,
            skippedCount,
            result
          };
        },
        request.log
      );

      return {
        provider: "tink",
        fetchedCount: outcome.tinkTransactions.length,
        preparedCount: outcome.transactions.length,
        skippedBeforeImportCount: outcome.skippedCount,
        importedCount: outcome.result.imported,
        skippedDuringImportCount: outcome.result.skipped
      };
    } catch (error) {
      if (error instanceof TinkReconnectRequiredError) {
        await convex
          .mutation(convexApi.providerConnections.apiMarkConnectionReconnectRequired, {
            apiSecret: config.apiServiceSecret,
            clerkUserId: userId,
            provider: "tink",
            errorCode: error.state.code ?? "RECONNECT_REQUIRED",
            errorMessage: error.message,
            credentialId: error.state.credentialId
          })
          .catch(() => undefined);

        return reply.code(409).send({
          error: "reconnect_required",
          errorCode: error.state.code,
          credentialId: error.state.credentialId,
          message: "Tink credentials need to be re-authorized before syncing."
        });
      }

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

  app.get<{ Querystring: { credentialsId?: string } }>(
    "/integrations/tink/extend-consent",
    async (request, reply) => {
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
        return sendNotConfigured(
          reply,
          "Tink",
          getMissingEnvDetail([
            "TINK_CLIENT_ID",
            "TINK_REDIRECT_URI",
            "OAUTH_STATE_SECRET",
            "API_SERVICE_SECRET"
          ])
        );
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

      if (!connection) {
        return reply.code(409).send({
          error: "not_connected",
          message: "Connect Tink before extending consent."
        });
      }

      const resolved = await resolveCredentialsIdForUser(
        convex,
        userId,
        request.query.credentialsId,
        connection.credentialsId
      );
      if (!resolved.credentialsId) {
        return reply.code(409).send({
          error: resolved.reason === "not_owned" ? "not_owned" : "no_credentials",
          message:
            resolved.reason === "not_owned"
              ? "credentialsId does not belong to this user."
              : "Connect Tink and complete a sync before extending consent."
        });
      }

      const state = createTinkState(config.oauthStateSecret, {
        tinkUserId: connection.externalUserId,
        clerkUserId: userId
      });

      const url = new URL(tinkLinkExtendConsentBaseUrl);
      url.searchParams.set("client_id", config.tinkClientId);
      url.searchParams.set("redirect_uri", config.tinkRedirectUri);
      url.searchParams.set("market", config.tinkMarket);
      url.searchParams.set("locale", config.tinkLocale);
      url.searchParams.set("credentials_id", resolved.credentialsId);
      url.searchParams.set("state", state);
      if (config.tinkTestMode) {
        url.searchParams.set("test", "true");
      }

      request.log.info(
        {
          provider: "tink",
          credentialsId: resolved.credentialsId,
          requestedCredentialsId: request.query.credentialsId,
          consentExpiresAt: connection.consentExpiresAt,
          linkUrl: sanitizeTinkLinkUrl(url)
        },
        "tink extend-consent url built"
      );

      return {
        provider: "tink",
        credentialsId: resolved.credentialsId,
        consentExpiresAt: connection.consentExpiresAt,
        url: url.toString()
      };
    }
  );

  app.post<{ Body: { credentialsId?: string } }>(
    "/integrations/tink/refresh-credentials",
    async (request, reply) => {
    const userId = requireUserId(request, reply);

    if (!userId) {
      return reply;
    }

    if (
      !config.tinkClientId ||
      !config.tinkRedirectUri ||
      !config.oauthStateSecret ||
      !config.apiServiceSecret ||
      !config.tokenEncryptionKey
    ) {
      return sendNotConfigured(
        reply,
        "Tink",
        getMissingEnvDetail([
          "TINK_CLIENT_ID",
          "TINK_REDIRECT_URI",
          "OAUTH_STATE_SECRET",
          "API_SERVICE_SECRET",
          "TOKEN_ENCRYPTION_KEY"
        ])
      );
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
        message: "Connect Tink before refreshing credentials."
      });
    }

    const resolved = await resolveCredentialsIdForUser(
      convex,
      userId,
      request.body?.credentialsId,
      connection.credentialsId
    );
    if (!resolved.credentialsId) {
      return reply.code(409).send({
        error: resolved.reason === "not_owned" ? "not_owned" : "no_credentials",
        message:
          resolved.reason === "not_owned"
            ? "credentialsId does not belong to this user."
            : "Complete a Tink sync once before refreshing credentials."
      });
    }
    const credentialsId = resolved.credentialsId;

    try {
      const outcome = await withTinkAccessToken(
        connection.tokenRef,
        async (accessToken) => {
          await refreshTinkCredentials(accessToken, credentialsId);
          return { method: "server_refresh" as const };
        },
        request.log
      );

      request.log.info(
        { provider: "tink", credentialsId, method: outcome.method },
        "tink credentials refresh requested server-side"
      );

      return {
        provider: "tink",
        credentialsId,
        method: outcome.method
      };
    } catch (error) {
      if (error instanceof TinkRefreshRequiresUserError) {
        const state = createTinkState(config.oauthStateSecret, {
          tinkUserId: connection.externalUserId,
          clerkUserId: userId
        });
        const url = new URL(tinkLinkUpdateConsentBaseUrl);
        url.searchParams.set("client_id", config.tinkClientId);
        url.searchParams.set("redirect_uri", config.tinkRedirectUri);
        url.searchParams.set("market", config.tinkMarket);
        url.searchParams.set("locale", config.tinkLocale);
        url.searchParams.set("credentials_id", credentialsId);
        url.searchParams.set("state", state);
        if (config.tinkTestMode) {
          url.searchParams.set("test", "true");
        }

        request.log.info(
          {
            provider: "tink",
            credentialsId,
            errorCode: error.errorCode,
            method: "link",
            linkUrl: sanitizeTinkLinkUrl(url)
          },
          "tink credentials refresh requires user; returning update-consent link"
        );

        return {
          provider: "tink",
          credentialsId,
          method: "link" as const,
          errorCode: error.errorCode,
          url: url.toString()
        };
      }

      request.log.warn(
        {
          provider: "tink",
          credentialsId,
          errorMessage: error instanceof Error ? error.message : "refresh failed"
        },
        "tink credentials refresh failed"
      );

      return reply.code(502).send({
        error: "refresh_failed",
        message: error instanceof Error ? error.message : "Tink credentials refresh failed"
      });
    }
  }
  );

  app.post("/integrations/tink/disconnect", async (request, reply) => {
    const userId = requireUserId(request, reply);

    if (!userId) {
      return reply;
    }

    if (!config.apiServiceSecret) {
      return sendNotConfigured(reply, "Tink", getMissingEnvDetail(["API_SERVICE_SECRET"]));
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

function sanitizeTinkLinkUrl(url: URL) {
  const sanitized = new URL(url.toString());
  for (const param of ["authorization_code", "authorization_token", "state", "client_id", "input_username"]) {
    if (sanitized.searchParams.has(param)) {
      sanitized.searchParams.set(param, "[redacted]");
    }
  }

  return sanitized.toString();
}

function getSanitizedTinkLinkParams(url: URL) {
  return {
    clientIdSuffix: url.searchParams.get("client_id")?.slice(-8),
    redirectUri: url.searchParams.get("redirect_uri"),
    market: url.searchParams.get("market"),
    locale: url.searchParams.get("locale"),
    scope: url.searchParams.get("scope"),
    stateLength: url.searchParams.get("state")?.length,
    authorizationCodeLength: url.searchParams.get("authorization_code")?.length,
    authorizationTokenLength: url.searchParams.get("authorization_token")?.length,
    test: url.searchParams.get("test"),
    inputProvider: url.searchParams.get("input_provider"),
    hasInputUsername: url.searchParams.has("input_username"),
    responseType: url.searchParams.get("response_type")
  };
}

async function getTinkCredentialDiagnostics(
  accessToken: string,
  expectedCredentialId: string | undefined,
  log: FastifyBaseLogger
) {
  try {
    const credentials = await listTinkCredentials(accessToken);
    const diagnosticCredentials = credentials.map((credential) => ({
      id: credential.id,
      providerName: credential.providerName,
      status: credential.status,
      statusUpdated: credential.statusUpdated,
      statusPayload: credential.statusPayload
    }));

    return {
      expectedCredentialId,
      count: credentials.length,
      credentials: diagnosticCredentials,
      rawCredentials: credentials
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tink credential diagnostics failed";
    log.warn(
      {
        provider: "tink",
        expectedCredentialId,
        errorMessage: message
      },
      "tink credential diagnostics failed"
    );

    return {
      expectedCredentialId,
      errorMessage: message
    };
  }
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

    const availableBalance = parseTinkAmountValue(account.balances?.available);
    const holderName =
      account.holderName?.trim() ||
      account.holders?.find((holder) => holder.name?.trim())?.name?.trim() ||
      undefined;
    const { iban, bban } = extractAccountIdentifiers(account.identifiers);
    const credentialsId =
      account.credentialsId?.trim() || account.credentials?.id?.trim() || undefined;

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
        0,
      availableBalance: availableBalance ?? undefined,
      institutionName: account.financialInstitutionName?.trim() || undefined,
      holderName,
      iban,
      bban,
      credentialsId
    });
  }

  return { accounts: normalized, skippedCount };
}

function extractAccountIdentifiers(identifiers: TinkAccount["identifiers"]) {
  let iban: string | undefined;
  let bban: string | undefined;

  if (!identifiers) {
    return { iban, bban };
  }

  for (const identifier of identifiers) {
    const scheme = identifier.scheme?.toLowerCase() ?? identifier.type?.toLowerCase();
    const ibanCandidate =
      typeof identifier.iban === "string"
        ? identifier.iban
        : identifier.iban?.iban;
    const bbanCandidate =
      typeof identifier.bban === "string"
        ? identifier.bban
        : identifier.bban?.bban;

    if (!iban && (scheme === "iban" || ibanCandidate)) {
      iban = ibanCandidate ?? identifier.value ?? undefined;
    }

    if (!bban && (scheme === "bban" || bbanCandidate)) {
      bban = bbanCandidate ?? identifier.value ?? undefined;
    }
  }

  return { iban: iban?.trim() || undefined, bban: bban?.trim() || undefined };
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

function normalizeTinkTransactions(
  transactions: TinkTransaction[],
  log?: FastifyBaseLogger,
  fx?: FxSnapshot
) {
  const fxSnapshot = fx ?? defaultEurStaticSnapshot();
  const normalized = [];
  let skippedCount = 0;
  const skipReasons: Record<string, number> = {};

  for (const transaction of transactions) {
    const providerAccountId = transaction.accountId ?? transaction.account?.id;
    const amount = parseTinkAmountValue(transaction.amount);
    const rawCurrency =
      transaction.currencyCode ??
      (typeof transaction.amount === "object"
        ? transaction.amount?.amount?.currencyCode ?? transaction.amount?.currencyCode
        : undefined);
    const currency = normalizeCurrency(rawCurrency);
    const postedAt = parseTinkDate(
      transaction.dates?.booked ?? transaction.bookedDate ?? transaction.dates?.value
    );
    const description =
      transaction.descriptions?.display ??
      transaction.description ??
      transaction.reference ??
      "Tink transaction";

    const skipReasonsForThis: string[] = [];
    if (!transaction.id) skipReasonsForThis.push("missing_id");
    if (!providerAccountId) skipReasonsForThis.push("missing_account_id");
    if (amount === null) skipReasonsForThis.push("unparseable_amount");
    if (!currency) skipReasonsForThis.push(`unsupported_currency:${rawCurrency ?? "none"}`);
    if (postedAt === null) skipReasonsForThis.push("unparseable_date");

    if (skipReasonsForThis.length > 0) {
      skippedCount += 1;
      for (const reason of skipReasonsForThis) {
        skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
      }
      continue;
    }

    if (
      !transaction.id ||
      !providerAccountId ||
      amount === null ||
      !currency ||
      postedAt === null
    ) {
      continue;
    }

    const merchant = transaction.merchantInformation?.merchantName ?? transaction.merchantName;
    const status: "booked" | "pending" =
      transaction.status?.toLowerCase() === "pending" ? "pending" : "booked";
    const { categoryId, tinkCategoryCode } = mapTinkCategoryCode(transaction.category);

    normalized.push({
      providerAccountId,
      providerTransactionId: transaction.id,
      postedAt,
      amount,
      currency,
      baseCurrencyAmount: toBaseCurrencyAmount(amount, currency, fxSnapshot),
      description,
      merchant,
      categoryId,
      tinkCategoryCode,
      type: normalizeTransactionType(amount, transaction.category),
      isRecurring: false,
      isExcludedFromReports: false,
      status,
      dedupeHash: createProviderDedupeHash({
        providerAccountId,
        postedAt,
        amount,
        currency,
        description,
        merchant
      })
    });
  }

  if (log && skippedCount > 0) {
    log.warn(
      {
        provider: "tink",
        totalFetched: transactions.length,
        skippedCount,
        skipReasons
      },
      "tink transactions skipped during normalization"
    );
  }

  return { transactions: normalized, skippedCount, skipReasons };
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

function defaultEurStaticSnapshot(): FxSnapshot {
  return {
    base: "EUR",
    rates: { EUR: 1, HUF: 1 / 0.00254, USD: 1 / 0.93, GBP: 1 / 1.16 },
    source: "static",
    fetchedAt: Date.now()
  };
}

async function runRecurringDetection(
  convex: NonNullable<ReturnType<typeof getConvexClient>>,
  clerkUserId: string,
  log: FastifyBaseLogger
) {
  if (!config.apiServiceSecret) {
    return;
  }

  try {
    const result = (await convex.mutation(
      convexApi.recurringSubscriptions.apiDetectForUser,
      {
        apiSecret: config.apiServiceSecret,
        clerkUserId
      }
    )) as {
      detected: number;
      created: number;
      updated: number;
      archived: number;
      taggedTransactions: number;
    };

    log.info(
      {
        provider: "tink",
        clerkUserId,
        ...result
      },
      "recurring subscription detection completed"
    );
  } catch (error) {
    log.warn(
      {
        provider: "tink",
        clerkUserId,
        errorMessage: error instanceof Error ? error.message : "recurring detection failed"
      },
      "recurring subscription detection failed"
    );
  }
}

async function runIncomeDetection(
  convex: NonNullable<ReturnType<typeof getConvexClient>>,
  clerkUserId: string,
  log: FastifyBaseLogger
) {
  if (!config.apiServiceSecret) {
    return;
  }

  try {
    const result = (await convex.mutation(convexApi.incomeStreams.apiDetectForUser, {
      apiSecret: config.apiServiceSecret,
      clerkUserId
    })) as {
      detected: number;
      created: number;
      updated: number;
      archived: number;
    };

    log.info(
      {
        provider: "tink",
        clerkUserId,
        ...result
      },
      "income stream detection completed"
    );
  } catch (error) {
    log.warn(
      {
        provider: "tink",
        clerkUserId,
        errorMessage: error instanceof Error ? error.message : "income detection failed"
      },
      "income stream detection failed"
    );
  }
}

async function runExpenseProfileDetection(
  convex: NonNullable<ReturnType<typeof getConvexClient>>,
  clerkUserId: string,
  log: FastifyBaseLogger
) {
  if (!config.apiServiceSecret) {
    return;
  }

  try {
    const result = (await convex.mutation(convexApi.expenseProfiles.apiDetectForUser, {
      apiSecret: config.apiServiceSecret,
      clerkUserId
    })) as {
      detected: number;
      created: number;
      updated: number;
      archived: number;
    };

    log.info(
      {
        provider: "tink",
        clerkUserId,
        ...result
      },
      "expense profile detection completed"
    );
  } catch (error) {
    log.warn(
      {
        provider: "tink",
        clerkUserId,
        errorMessage: error instanceof Error ? error.message : "expense profile detection failed"
      },
      "expense profile detection failed"
    );
  }
}

async function persistBalanceSnapshots(
  convex: NonNullable<ReturnType<typeof getConvexClient>>,
  normalizedAccounts: NormalizedProviderAccount[],
  upsertedAccounts: UpsertProviderAccountsResult["upsertedAccounts"],
  log: FastifyBaseLogger
) {
  if (!config.apiServiceSecret) {
    return;
  }

  const snapshotDate = new Date().toISOString().slice(0, 10);
  const accountIdByProvider = new Map(
    upsertedAccounts.map((entry) => [entry.providerAccountId, entry.accountId])
  );

  for (const account of normalizedAccounts) {
    const accountId = accountIdByProvider.get(account.providerAccountId);
    if (!accountId) {
      continue;
    }

    try {
      await convex.mutation(convexApi.accounts.apiInsertBalanceSnapshot, {
        apiSecret: config.apiServiceSecret,
        accountId,
        snapshotDate,
        bookedBalance: account.currentBalance,
        availableBalance: account.availableBalance,
        currency: account.currency
      });
    } catch (error) {
      log.warn(
        {
          provider: "tink",
          providerAccountId: account.providerAccountId,
          errorMessage: error instanceof Error ? error.message : "balance snapshot failed"
        },
        "tink balance snapshot persist failed"
      );
    }
  }
}

async function resolveCredentialsIdForUser(
  convex: NonNullable<ReturnType<typeof getConvexClient>>,
  clerkUserId: string,
  requested: string | undefined,
  fallback: string | undefined
): Promise<{ credentialsId: string | null; reason?: "not_owned" }> {
  if (requested) {
    if (!config.apiServiceSecret) {
      return { credentialsId: null };
    }

    const ownership = (await convex.query(
      convexApi.tinkCredentials.apiGetCredentialOwnership,
      {
        apiSecret: config.apiServiceSecret,
        clerkUserId,
        credentialsId: requested
      }
    )) as { owned: boolean } | null;

    if (!ownership?.owned) {
      return { credentialsId: null, reason: "not_owned" };
    }

    return { credentialsId: requested };
  }

  return { credentialsId: fallback ?? null };
}

async function captureProviderConsentAndCredentials(
  convex: NonNullable<ReturnType<typeof getConvexClient>>,
  accessToken: string,
  clerkUserId: string,
  preferredCredentialsId: string | undefined,
  credentials: Awaited<ReturnType<typeof listTinkCredentials>>,
  normalizedAccounts: NormalizedProviderAccount[],
  log: FastifyBaseLogger
) {
  if (!config.apiServiceSecret) {
    return;
  }

  try {
    const consents = await listTinkProviderConsents(accessToken);

    const primary = pickPrimaryProviderConsent(consents, preferredCredentialsId);
    const accountsByCredentialsId = new Map<string, NormalizedProviderAccount[]>();
    for (const account of normalizedAccounts) {
      if (!account.credentialsId) continue;
      const list = accountsByCredentialsId.get(account.credentialsId) ?? [];
      list.push(account);
      accountsByCredentialsId.set(account.credentialsId, list);
    }
    const fallbackInstitutionName =
      normalizedAccounts.find((account) => account.institutionName)?.institutionName;

    if (primary) {
      await convex.mutation(convexApi.providerConnections.apiUpdateConnectionConsent, {
        apiSecret: config.apiServiceSecret,
        clerkUserId,
        provider: "tink",
        consentExpiresAt: primary.consentExpiresAt,
        credentialsId: primary.credentialsId,
        institutionName: fallbackInstitutionName
      });
    }

    const credentialRows = buildTinkCredentialRows(credentials, consents).map((row) => ({
      ...row,
      institutionName:
        accountsByCredentialsId.get(row.credentialsId)?.find((a) => a.institutionName)
          ?.institutionName ??
        (row.credentialsId === primary?.credentialsId ? fallbackInstitutionName : undefined)
    }));

    if (credentialRows.length > 0) {
      const upsertResult = (await convex.mutation(
        convexApi.tinkCredentials.apiUpsertTinkCredentials,
        {
          apiSecret: config.apiServiceSecret,
          clerkUserId,
          provider: "tink",
          credentials: credentialRows
        }
      )) as { upsertedCount: number; archivedCount: number };

      log.info(
        {
          provider: "tink",
          credentialCount: credentialRows.length,
          upsertedCount: upsertResult.upsertedCount,
          archivedCount: upsertResult.archivedCount
        },
        "tink credential snapshot upserted"
      );
    }

    log.info(
      {
        provider: "tink",
        primaryCredentialsId: primary?.credentialsId,
        consentExpiresAt: primary?.consentExpiresAt,
        consentCount: consents.length
      },
      "tink provider consent captured"
    );
  } catch (error) {
    log.warn(
      {
        provider: "tink",
        errorMessage: error instanceof Error ? error.message : "consent capture failed"
      },
      "tink provider consent and credential capture failed"
    );
  }
}

async function resolveFxSnapshot(
  clerkUserId: string,
  log: FastifyBaseLogger
): Promise<FxSnapshot> {
  const convex = getConvexClient();
  if (!convex || !config.apiServiceSecret) {
    return await getFxSnapshot("EUR", log);
  }

  let base: FxBaseCurrency = "EUR";
  try {
    const result = (await convex.query(convexApi.users.apiGetUserBaseCurrency, {
      apiSecret: config.apiServiceSecret,
      clerkUserId
    })) as FxBaseCurrency | null;

    if (result === "EUR" || result === "HUF" || result === "USD" || result === "GBP") {
      base = result;
    }
  } catch (error) {
    log.warn(
      {
        provider: "tink",
        errorMessage: error instanceof Error ? error.message : "fx base lookup failed"
      },
      "tink fx base currency lookup failed; falling back to EUR"
    );
  }

  return await getFxSnapshot(base, log);
}

function createProviderDedupeHash(input: {
  providerAccountId: string;
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

function getMissingEnvDetail(envNames: string[]) {
  const missing = envNames.filter((envName) => !getConfigValueForEnvName(envName));
  return missing.length > 0 ? `Missing ${missing.join(" and ")}.` : undefined;
}

function getConfigValueForEnvName(envName: string) {
  switch (envName) {
    case "API_SERVICE_SECRET":
      return config.apiServiceSecret;
    case "OAUTH_STATE_SECRET":
      return config.oauthStateSecret;
    case "TINK_CLIENT_ID":
      return config.tinkClientId;
    case "TINK_CLIENT_SECRET":
      return config.tinkClientSecret;
    case "TINK_REDIRECT_URI":
      return config.tinkRedirectUri;
    case "TOKEN_ENCRYPTION_KEY":
      return config.tokenEncryptionKey;
    default:
      return undefined;
  }
}
