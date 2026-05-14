import { ensureMirrorDatabaseReady } from "../db/client";
import { accountsRepo, transactionsRepo } from "../db/repositories";
import { isWebFallbackStorageEnabled, webFallbackStore } from "../db/webFallbackStore";
import { runSQLitePFMDetection } from "../services/sqlitePfm";
import { getTinkBridgeTokens } from "./tinkBridge";
import {
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
    const transactionSync = normalizeTinkTransactions(tinkTransactions, accountIdByProviderId, now);
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
  const transactionSync = normalizeTinkTransactions(tinkTransactions, accountIdByProviderId, now);
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
