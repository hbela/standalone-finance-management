import { useCallback, useEffect, useRef, useState } from "react";

import type { Doc } from "../../../../convex/_generated/dataModel";
import { ensureMirrorDatabaseReady, getMirrorDatabase, type MirrorDatabase } from "./client";
import {
  accountToRow,
  balanceSnapshotToRow,
  categoryToRow,
  expenseProfileToRow,
  importBatchToRow,
  incomeStreamToRow,
  liabilityToRow,
  recurringSubscriptionToRow,
  transactionToRow,
  userToRow,
} from "./mappers";
import {
  accountsRepo,
  ALL_REPOS,
  balanceSnapshotsRepo,
  categoriesRepo,
  expenseProfilesRepo,
  importBatchesRepo,
  incomeStreamsRepo,
  liabilitiesRepo,
  recurringSubscriptionsRepo,
  transactionsRepo,
  usersRepo,
  type MirrorRepoName,
} from "./repositories";

export const DUAL_WRITE_ENABLED = process.env.EXPO_PUBLIC_DUAL_WRITE === "true";

export type ConvexSnapshot = {
  user: Doc<"users"> | null | undefined;
  accounts: Array<Doc<"accounts">> | undefined;
  transactions: Array<Doc<"transactions">> | undefined;
  categories: Array<Doc<"categories">> | undefined;
  liabilities: Array<Doc<"liabilities">> | undefined;
  importBatches: Array<Doc<"importBatches">> | undefined;
  balanceSnapshots?: Array<Doc<"balanceSnapshots">>;
  recurringSubscriptions?: Array<Doc<"recurringSubscriptions">>;
  incomeStreams?: Array<Doc<"incomeStreams">>;
  expenseProfiles?: Array<Doc<"expenseProfiles">>;
};

export type ParityResult = {
  table: MirrorRepoName;
  convexCount: number;
  sqliteCount: number;
  matches: boolean;
};

export type MirrorStatus = {
  enabled: boolean;
  ready: boolean;
  lastError: string | null;
  lastMirroredAt: number | null;
};

export function useDualWriteMirror(snapshot: ConvexSnapshot): {
  status: MirrorStatus;
  runParityCheck: () => Promise<ParityResult[]>;
} {
  const [status, setStatus] = useState<MirrorStatus>({
    enabled: DUAL_WRITE_ENABLED,
    ready: false,
    lastError: null,
    lastMirroredAt: null,
  });
  const dbRef = useRef<MirrorDatabase | null>(null);

  // Bootstrap on first mount, only when feature-flag-enabled.
  useEffect(() => {
    if (!DUAL_WRITE_ENABLED) return;
    let cancelled = false;
    (async () => {
      try {
        const db = await ensureMirrorDatabaseReady();
        if (cancelled) return;
        dbRef.current = db;
        setStatus((prev) => ({ ...prev, ready: true, lastError: null }));
      } catch (err) {
        if (cancelled) return;
        setStatus((prev) => ({
          ...prev,
          ready: false,
          lastError: err instanceof Error ? err.message : String(err),
        }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Mirror each Convex query result whenever it changes. Each mirror call is independent,
  // so a failure on one table doesn't block the others.
  useMirrorEffect(dbRef, status.ready, snapshot.user, async (db, doc) => {
    await usersRepo.mirror(db, doc ? [userToRow(doc)] : []);
  });
  useMirrorEffect(dbRef, status.ready, snapshot.accounts, async (db, docs) => {
    await accountsRepo.mirror(db, (docs ?? []).map(accountToRow));
  });
  useMirrorEffect(dbRef, status.ready, snapshot.transactions, async (db, docs) => {
    await transactionsRepo.mirror(db, (docs ?? []).map(transactionToRow));
  });
  useMirrorEffect(dbRef, status.ready, snapshot.categories, async (db, docs) => {
    await categoriesRepo.mirror(db, (docs ?? []).map(categoryToRow));
  });
  useMirrorEffect(dbRef, status.ready, snapshot.liabilities, async (db, docs) => {
    await liabilitiesRepo.mirror(db, (docs ?? []).map(liabilityToRow));
  });
  useMirrorEffect(dbRef, status.ready, snapshot.importBatches, async (db, docs) => {
    await importBatchesRepo.mirror(db, (docs ?? []).map(importBatchToRow));
  });
  useMirrorEffect(dbRef, status.ready, snapshot.balanceSnapshots, async (db, docs) => {
    await balanceSnapshotsRepo.mirror(db, (docs ?? []).map(balanceSnapshotToRow));
  });
  useMirrorEffect(dbRef, status.ready, snapshot.recurringSubscriptions, async (db, docs) => {
    await recurringSubscriptionsRepo.mirror(
      db,
      (docs ?? []).map(recurringSubscriptionToRow)
    );
  });
  useMirrorEffect(dbRef, status.ready, snapshot.incomeStreams, async (db, docs) => {
    await incomeStreamsRepo.mirror(db, (docs ?? []).map(incomeStreamToRow));
  });
  useMirrorEffect(dbRef, status.ready, snapshot.expenseProfiles, async (db, docs) => {
    await expenseProfilesRepo.mirror(db, (docs ?? []).map(expenseProfileToRow));
  });

  // Track the time of the most recent successful mirror op for status display.
  useEffect(() => {
    if (!status.ready) return;
    setStatus((prev) => ({ ...prev, lastMirroredAt: Date.now() }));
  }, [
    snapshot.user,
    snapshot.accounts,
    snapshot.transactions,
    snapshot.categories,
    snapshot.liabilities,
    snapshot.importBatches,
    snapshot.balanceSnapshots,
    snapshot.recurringSubscriptions,
    snapshot.incomeStreams,
    snapshot.expenseProfiles,
    status.ready,
  ]);

  const runParityCheck = useCallback(async (): Promise<ParityResult[]> => {
    if (!DUAL_WRITE_ENABLED) {
      throw new Error("EXPO_PUBLIC_DUAL_WRITE must be 'true' to run a parity check");
    }
    const db = await ensureMirrorDatabaseReady();
    return computeParity(db, snapshot);
  }, [snapshot]);

  return { status, runParityCheck };
}

function useMirrorEffect<TInput>(
  dbRef: React.MutableRefObject<MirrorDatabase | null>,
  ready: boolean,
  input: TInput,
  perform: (db: MirrorDatabase, input: TInput) => Promise<void>
) {
  useEffect(() => {
    if (!DUAL_WRITE_ENABLED || !ready || input === undefined) return;
    const db = dbRef.current;
    if (!db) return;
    void perform(db, input).catch((err) => {
      console.warn("[mirror] table mirror failed", err);
    });
    // intentionally exclude `perform` — the caller passes a fresh closure each render but
    // its behavior is keyed by `input`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, ready]);
}

function computeParity(db: MirrorDatabase, snapshot: ConvexSnapshot): ParityResult[] {
  const results: ParityResult[] = [];

  const push = (
    table: MirrorRepoName,
    convexCount: number,
    sqliteCount: number
  ) => {
    results.push({ table, convexCount, sqliteCount, matches: convexCount === sqliteCount });
  };

  push("users", snapshot.user ? 1 : 0, ALL_REPOS.users.count(db)?.count ?? 0);
  push("accounts", snapshot.accounts?.length ?? 0, ALL_REPOS.accounts.count(db)?.count ?? 0);
  push(
    "transactions",
    snapshot.transactions?.length ?? 0,
    ALL_REPOS.transactions.count(db)?.count ?? 0
  );
  push(
    "categories",
    snapshot.categories?.length ?? 0,
    ALL_REPOS.categories.count(db)?.count ?? 0
  );
  push(
    "liabilities",
    snapshot.liabilities?.length ?? 0,
    ALL_REPOS.liabilities.count(db)?.count ?? 0
  );
  push(
    "importBatches",
    snapshot.importBatches?.length ?? 0,
    ALL_REPOS.importBatches.count(db)?.count ?? 0
  );
  push(
    "balanceSnapshots",
    snapshot.balanceSnapshots?.length ?? 0,
    ALL_REPOS.balanceSnapshots.count(db)?.count ?? 0
  );
  push(
    "recurringSubscriptions",
    snapshot.recurringSubscriptions?.length ?? 0,
    ALL_REPOS.recurringSubscriptions.count(db)?.count ?? 0
  );
  push(
    "incomeStreams",
    snapshot.incomeStreams?.length ?? 0,
    ALL_REPOS.incomeStreams.count(db)?.count ?? 0
  );
  push(
    "expenseProfiles",
    snapshot.expenseProfiles?.length ?? 0,
    ALL_REPOS.expenseProfiles.count(db)?.count ?? 0
  );

  return results;
}

// Direct DB accessor for callers that want to read mirrored data outside the hook
// (e.g., parity check from non-React code, or future SQLite-backed queries).
export function getMirroredDatabaseSync(): MirrorDatabase | null {
  if (!DUAL_WRITE_ENABLED) return null;
  return getMirrorDatabase();
}
