import { ensureMirrorDatabaseReady } from "../db/client";
import { accountsRepo, transactionsRepo } from "../db/repositories";
import { isWebFallbackStorageEnabled, webFallbackStore } from "../db/webFallbackStore";
import {
  buildStaticSnapshot,
  ensureFxSnapshot,
  toBaseCurrencyAmount,
} from "../services/fxRates";
import { runSQLitePFMDetection } from "../services/sqlitePfm";
import { getTinkBridgeTokens } from "./tinkBridge";
import {
  type ConvertToBaseFn,
  getDefaultTransactionWindow,
  normalizeTinkAccounts,
  normalizeTinkTransactions,
} from "./tinkNormalization";
import {
  listTinkAccounts,
  listTinkTransactions,
} from "./tinkMobileClient";

export type TinkMobileSyncResult = {
  accounts: {
    fetchedCount: number;
    importedCount: number;
    skippedCount: number;
  };
  transactions: {
    fetchedCount: number;
    importedCount: number;
    skippedCount: number;
    skipReasons: Record<string, number>;
  };
};

export async function syncTinkToSQLite(): Promise<TinkMobileSyncResult> {
  const tokens = await getTinkBridgeTokens();
  if (!tokens?.accessToken) {
    throw new Error("Connect Tink before syncing.");
  }

  const now = Date.now();
  const tinkAccounts = await listTinkAccounts(tokens.accessToken);
  const accountSync = normalizeTinkAccounts(tinkAccounts, now);
  if (isWebFallbackStorageEnabled()) {
    await webFallbackStore.accounts.upsert(accountSync.accounts);

    const accountRows = await webFallbackStore.accounts.list();
    const accountIdByProviderId = new Map(
      accountRows
        .filter((account) => account.providerAccountId)
        .map((account) => [account.providerAccountId as string, account.id])
    );
    const tinkTransactions = await listTinkTransactions(tokens.accessToken, getDefaultTransactionWindow(now));
    // Web fallback has no SQLite-backed FX cache, so use the static snapshot.
    // Native paths below hit Frankfurter via ensureFxSnapshot.
    const fallbackSnapshot = buildStaticSnapshot("EUR", now);
    const convertToBase: ConvertToBaseFn = (amount, currency) =>
      toBaseCurrencyAmount(amount, currency, fallbackSnapshot);
    const transactionSync = normalizeTinkTransactions(
      tinkTransactions,
      accountIdByProviderId,
      now,
      convertToBase
    );
    await webFallbackStore.transactions.upsert(transactionSync.transactions);

    return {
      accounts: {
        fetchedCount: tinkAccounts.length,
        importedCount: accountSync.accounts.length,
        skippedCount: accountSync.skippedCount
      },
      transactions: {
        fetchedCount: tinkTransactions.length,
        importedCount: transactionSync.transactions.length,
        skippedCount: transactionSync.skippedCount,
        skipReasons: transactionSync.skipReasons
      }
    };
  }

  const db = await ensureMirrorDatabaseReady();
  await accountsRepo.upsert(db, accountSync.accounts);

  const accountRows = await accountsRepo.list(db);
  const accountIdByProviderId = new Map(
    accountRows
      .filter((account) => account.providerAccountId)
      .map((account) => [account.providerAccountId as string, account.id])
  );

  const tinkTransactions = await listTinkTransactions(tokens.accessToken, getDefaultTransactionWindow(now));
  const fxSnapshot = await ensureFxSnapshot(db, "EUR", now);
  const convertToBase: ConvertToBaseFn = (amount, currency) =>
    toBaseCurrencyAmount(amount, currency, fxSnapshot);
  const transactionSync = normalizeTinkTransactions(
    tinkTransactions,
    accountIdByProviderId,
    now,
    convertToBase
  );
  await transactionsRepo.upsert(db, transactionSync.transactions);
  await runSQLitePFMDetection(db);

  return {
    accounts: {
      fetchedCount: tinkAccounts.length,
      importedCount: accountSync.accounts.length,
      skippedCount: accountSync.skippedCount
    },
    transactions: {
      fetchedCount: tinkTransactions.length,
      importedCount: transactionSync.transactions.length,
      skippedCount: transactionSync.skippedCount,
      skipReasons: transactionSync.skipReasons
    }
  };
}
