import { eq } from "drizzle-orm";

import { ensureMirrorDatabaseReady, type MirrorDatabase } from "../db/client";
import type {
  AccountRow,
  ExpenseProfileRow,
  IncomeStreamRow,
  RecurringSubscriptionRow,
  TransactionRow,
} from "../db/mappers";
import {
  accountsRepo,
  expenseProfilesRepo,
  incomeStreamsRepo,
  recurringSubscriptionsRepo,
  transactionsRepo,
} from "../db/repositories";
import { isWebFallbackStorageEnabled, webFallbackStore } from "../db/webFallbackStore";
import * as schema from "../db/schema";
import type { Currency } from "../data/types";
import {
  buildStaticSnapshot,
  ensureFxSnapshot,
  toBaseCurrencyAmount,
  type FxBaseCurrency,
  type FxSnapshot,
} from "./fxRates";
import {
  computeBalanceForecast,
  computeExpenseProfiles,
  detectRecurringGroups,
  type ForecastResult,
} from "../utils/pfm";

export type PFMDetectionResult = {
  recurringSubscriptions: { detected: number; created: number; updated: number; archived: number };
  incomeStreams: { detected: number; created: number; updated: number; archived: number };
  expenseProfiles: { detected: number; created: number; updated: number; archived: number };
  taggedTransactions: number;
};

export async function runSQLitePFMDetection(db?: MirrorDatabase) {
  if (isWebFallbackStorageEnabled()) {
    return {
      recurringSubscriptions: { detected: 0, created: 0, updated: 0, archived: 0 },
      incomeStreams: { detected: 0, created: 0, updated: 0, archived: 0 },
      expenseProfiles: { detected: 0, created: 0, updated: 0, archived: 0 },
      taggedTransactions: 0,
    };
  }
  const database = db ?? (await ensureMirrorDatabaseReady());
  const now = Date.now();
  await ensureFxSnapshot(database, "EUR", now);
  const transactions = await transactionsRepo.list(database);
  const recurringResult = await syncRecurringSubscriptions(database, transactions, now);
  const incomeResult = await syncIncomeStreams(database, transactions, now);
  const expenseResult = await syncExpenseProfiles(database, transactions, now);

  return {
    recurringSubscriptions: recurringResult.stats,
    incomeStreams: incomeResult,
    expenseProfiles: expenseResult,
    taggedTransactions: recurringResult.taggedTransactions,
  };
}

export async function listActiveRecurringSubscriptions(db?: MirrorDatabase) {
  if (isWebFallbackStorageEnabled()) {
    return (await webFallbackStore.recurringSubscriptions.list()).filter(
      (subscription) => !subscription.archivedAt
    );
  }
  const database = db ?? (await ensureMirrorDatabaseReady());
  return (await recurringSubscriptionsRepo.list(database))
    .filter((subscription) => !subscription.archivedAt)
    .sort((left, right) => right.lastSeenAt - left.lastSeenAt);
}

export async function listActiveIncomeStreams(db?: MirrorDatabase) {
  if (isWebFallbackStorageEnabled()) {
    return (await webFallbackStore.incomeStreams.list()).filter((stream) => !stream.archivedAt);
  }
  const database = db ?? (await ensureMirrorDatabaseReady());
  return (await incomeStreamsRepo.list(database))
    .filter((stream) => !stream.archivedAt)
    .sort((left, right) => right.lastSeenAt - left.lastSeenAt);
}

export async function listActiveExpenseProfiles(db?: MirrorDatabase) {
  if (isWebFallbackStorageEnabled()) {
    return (await webFallbackStore.expenseProfiles.list()).filter((profile) => !profile.archivedAt);
  }
  const database = db ?? (await ensureMirrorDatabaseReady());
  return (await expenseProfilesRepo.list(database))
    .filter((profile) => !profile.archivedAt)
    .sort((left, right) => left.monthlyAverage - right.monthlyAverage);
}

export async function confirmIncomeStream(streamId: string) {
  await patchPFMRow(schema.incomeStreams, streamId, { confirmedAt: Date.now(), dismissedAt: null });
}

export async function dismissIncomeStream(streamId: string) {
  await patchPFMRow(schema.incomeStreams, streamId, { dismissedAt: Date.now() });
}

export async function archiveIncomeStream(streamId: string) {
  await patchPFMRow(schema.incomeStreams, streamId, { archivedAt: Date.now() });
}

export async function confirmExpenseProfile(profileId: string) {
  await patchPFMRow(schema.expenseProfiles, profileId, { confirmedAt: Date.now(), dismissedAt: null });
}

export async function dismissExpenseProfile(profileId: string) {
  await patchPFMRow(schema.expenseProfiles, profileId, { dismissedAt: Date.now() });
}

export async function archiveExpenseProfile(profileId: string) {
  await patchPFMRow(schema.expenseProfiles, profileId, { archivedAt: Date.now() });
}

export async function confirmRecurringSubscription(subscriptionId: string) {
  await patchPFMRow(schema.recurringSubscriptions, subscriptionId, {
    confirmedAt: Date.now(),
    dismissedAt: null,
  });
}

export async function dismissRecurringSubscription(subscriptionId: string) {
  const db = await ensureMirrorDatabaseReady();
  const subscription = (await recurringSubscriptionsRepo.list(db)).find(
    (candidate) => candidate.id === subscriptionId
  );
  await patchPFMRow(schema.recurringSubscriptions, subscriptionId, { dismissedAt: Date.now() }, db);
  if (subscription?.confirmedAt) {
    await clearTransactionRecurringTags(db, subscriptionId);
  }
}

export async function archiveRecurringSubscription(subscriptionId: string) {
  const db = await ensureMirrorDatabaseReady();
  await patchPFMRow(schema.recurringSubscriptions, subscriptionId, { archivedAt: Date.now() }, db);
  await clearTransactionRecurringTags(db, subscriptionId);
}

export async function getSQLiteBalanceForecast(input: {
  horizonDays?: number;
  baseCurrency?: Currency;
}): Promise<ForecastResult> {
  if (isWebFallbackStorageEnabled()) {
    const baseCurrency = input.baseCurrency ?? "EUR";
    const snapshot = buildStaticSnapshot(baseCurrency, Date.now());
    const accounts = (await webFallbackStore.accounts.list()).filter((account) => !account.archivedAt);
    return computeBalanceForecast({
      startingBalance: accounts.reduce(
        (sum, account) => sum + toBaseCurrencyAmount(account.currentBalance, account.currency, snapshot),
        0
      ),
      currency: baseCurrency,
      now: Date.now(),
      horizonDays: input.horizonDays,
      inflows: [],
      outflows: [],
      convertToBase: (amount, currency) => toBaseCurrencyAmount(amount, currency, snapshot),
    });
  }
  const db = await ensureMirrorDatabaseReady();
  const baseCurrency = input.baseCurrency ?? "EUR";
  const snapshot = await ensureFxSnapshot(db, baseCurrency, Date.now());
  const accounts = (await accountsRepo.list(db)).filter((account) => !account.archivedAt);
  const subscriptions = (await recurringSubscriptionsRepo.list(db)).filter(
    (subscription) => !subscription.archivedAt && !subscription.dismissedAt && subscription.nextExpectedAt
  );
  const streams = (await incomeStreamsRepo.list(db)).filter(
    (stream) => !stream.archivedAt && !stream.dismissedAt && stream.nextExpectedAt
  );

  return computeBalanceForecast({
    startingBalance: accounts.reduce(
      (sum, account) => sum + toBaseCurrencyAmount(account.currentBalance, account.currency, snapshot),
      0
    ),
    currency: baseCurrency,
    now: Date.now(),
    horizonDays: input.horizonDays,
    inflows: streams.map((stream) => ({
      amount: stream.averageAmount,
      currency: stream.currency,
      frequency: stream.frequency as never,
      nextExpectedAt: stream.nextExpectedAt as number,
    })),
    outflows: subscriptions.map((subscription) => ({
      amount: subscription.averageAmount,
      currency: subscription.currency,
      frequency: subscription.frequency as never,
      nextExpectedAt: subscription.nextExpectedAt as number,
    })),
    convertToBase: (amount, currency) => toBaseCurrencyAmount(amount, currency, snapshot),
  });
}

async function syncRecurringSubscriptions(
  db: MirrorDatabase,
  transactions: TransactionRow[],
  now: number
) {
  const groups = detectRecurringGroups(transactions).filter((group) => group.type !== "income");
  const existing = await recurringSubscriptionsRepo.list(db);
  const existingByGroupKey = new Map(existing.map((subscription) => [subscription.groupKey, subscription]));
  const rows: RecurringSubscriptionRow[] = [];
  const seenGroupKeys = new Set<string>();
  const groupKeyToId = new Map<string, string>();
  let created = 0;
  let updated = 0;

  for (const group of groups) {
    const current = existingByGroupKey.get(group.groupKey);
    seenGroupKeys.add(group.groupKey);
    if (current?.dismissedAt && current.lastSeenAt >= group.lastSeenAt) {
      groupKeyToId.set(group.groupKey, current.id);
      continue;
    }

    const id = current?.id ?? `recurring-${stableHash(group.groupKey)}`;
    rows.push({
      id,
      userId: current?.userId ?? "device-local-user",
      accountId: group.accountId,
      groupKey: group.groupKey,
      merchant: group.merchant,
      category: group.category ?? null,
      type: group.type,
      currency: group.currency,
      averageAmount: group.averageAmount,
      monthlyAmount: group.monthlyAmount,
      frequency: group.frequency,
      confidence: group.confidence,
      transactionCount: group.transactionIds.length,
      firstSeenAt: group.firstSeenAt,
      lastSeenAt: group.lastSeenAt,
      nextExpectedAt: group.nextExpectedAt,
      confirmedAt: current?.confirmedAt ?? null,
      dismissedAt: current?.dismissedAt ?? null,
      archivedAt: null,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    });
    groupKeyToId.set(group.groupKey, id);
    if (current) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  await recurringSubscriptionsRepo.upsert(db, rows);
  let archived = 0;
  for (const subscription of existing) {
    if (seenGroupKeys.has(subscription.groupKey) || subscription.archivedAt) continue;
    await db
      .update(schema.recurringSubscriptions)
      .set({ archivedAt: now, updatedAt: now })
      .where(eq(schema.recurringSubscriptions.id, subscription.id));
    await clearTransactionRecurringTags(db, subscription.id);
    archived += 1;
  }

  const desiredTags = new Map<string, string>();
  for (const group of groups) {
    const subscriptionId = groupKeyToId.get(group.groupKey);
    if (!subscriptionId) continue;
    for (const transactionId of group.transactionIds) {
      desiredTags.set(transactionId, subscriptionId);
    }
  }

  let taggedTransactions = 0;
  for (const transaction of transactions) {
    const desiredSubscriptionId = desiredTags.get(transaction.id);
    if (desiredSubscriptionId) {
      if (transaction.recurringGroupId !== desiredSubscriptionId || !transaction.isRecurring) {
        await db
          .update(schema.transactions)
          .set({ isRecurring: true, recurringGroupId: desiredSubscriptionId, updatedAt: now })
          .where(eq(schema.transactions.id, transaction.id));
        taggedTransactions += 1;
      }
    } else if (transaction.recurringGroupId) {
      await db
        .update(schema.transactions)
        .set({ isRecurring: false, recurringGroupId: null, updatedAt: now })
        .where(eq(schema.transactions.id, transaction.id));
      taggedTransactions += 1;
    }
  }

  return { stats: { detected: groups.length, created, updated, archived }, taggedTransactions };
}

async function syncIncomeStreams(db: MirrorDatabase, transactions: TransactionRow[], now: number) {
  const groups = detectRecurringGroups(transactions).filter(
    (group) => group.type === "income" && group.averageAmount > 0
  );
  const existing = await incomeStreamsRepo.list(db);
  const existingByGroupKey = new Map(existing.map((stream) => [stream.groupKey, stream]));
  const seenGroupKeys = new Set<string>();
  let created = 0;
  let updated = 0;

  await incomeStreamsRepo.upsert(
    db,
    groups.flatMap<IncomeStreamRow>((group) => {
      const current = existingByGroupKey.get(group.groupKey);
      seenGroupKeys.add(group.groupKey);
      if (current?.dismissedAt && current.lastSeenAt >= group.lastSeenAt) return [];
      if (current) {
        updated += 1;
      } else {
        created += 1;
      }
      return [
        {
          id: current?.id ?? `income-${stableHash(group.groupKey)}`,
          userId: current?.userId ?? "device-local-user",
          accountId: group.accountId,
          groupKey: group.groupKey,
          employerName: group.merchant,
          currency: group.currency,
          averageAmount: group.averageAmount,
          monthlyAverage: group.monthlyAmount,
          frequency: group.frequency,
          confidence: group.confidence,
          transactionCount: group.transactionIds.length,
          firstSeenAt: group.firstSeenAt,
          lastSeenAt: group.lastSeenAt,
          nextExpectedAt: group.nextExpectedAt,
          confirmedAt: current?.confirmedAt ?? null,
          dismissedAt: current?.dismissedAt ?? null,
          archivedAt: null,
          createdAt: current?.createdAt ?? now,
          updatedAt: now,
        },
      ];
    })
  );

  const archived = await archiveUnseenIncomeStreams(db, existing, seenGroupKeys, now);
  return { detected: groups.length, created, updated, archived };
}

async function syncExpenseProfiles(db: MirrorDatabase, transactions: TransactionRow[], now: number) {
  const profiles = computeExpenseProfiles(transactions);
  const existing = await expenseProfilesRepo.list(db);
  const existingByGroupKey = new Map(existing.map((profile) => [profile.groupKey, profile]));
  const seenGroupKeys = new Set<string>();
  let created = 0;
  let updated = 0;

  await expenseProfilesRepo.upsert(
    db,
    profiles.flatMap<ExpenseProfileRow>((profile) => {
      const current = existingByGroupKey.get(profile.groupKey);
      seenGroupKeys.add(profile.groupKey);
      if (current?.dismissedAt && current.lastSeenAt >= profile.lastSeenAt) return [];
      if (current) {
        updated += 1;
      } else {
        created += 1;
      }
      return [
        {
          id: current?.id ?? `expense-${stableHash(profile.groupKey)}`,
          userId: current?.userId ?? "device-local-user",
          groupKey: profile.groupKey,
          category: profile.category,
          currency: profile.currency,
          monthlyAverage: profile.monthlyAverage,
          totalAmount: profile.totalAmount,
          monthsObserved: profile.monthsObserved,
          transactionCount: profile.transactionCount,
          firstSeenAt: profile.firstSeenAt,
          lastSeenAt: profile.lastSeenAt,
          confidence: profile.confidence,
          confirmedAt: current?.confirmedAt ?? null,
          dismissedAt: current?.dismissedAt ?? null,
          archivedAt: null,
          createdAt: current?.createdAt ?? now,
          updatedAt: now,
        },
      ];
    })
  );

  const archived = await archiveUnseenExpenseProfiles(db, existing, seenGroupKeys, now);
  return { detected: profiles.length, created, updated, archived };
}

async function archiveUnseenIncomeStreams(
  db: MirrorDatabase,
  rows: IncomeStreamRow[],
  seenGroupKeys: Set<string>,
  now: number
) {
  let archived = 0;
  for (const row of rows) {
    if (seenGroupKeys.has(row.groupKey) || row.archivedAt) continue;
    await db.update(schema.incomeStreams).set({ archivedAt: now, updatedAt: now }).where(eq(schema.incomeStreams.id, row.id));
    archived += 1;
  }
  return archived;
}

async function archiveUnseenExpenseProfiles(
  db: MirrorDatabase,
  rows: ExpenseProfileRow[],
  seenGroupKeys: Set<string>,
  now: number
) {
  let archived = 0;
  for (const row of rows) {
    if (seenGroupKeys.has(row.groupKey) || row.archivedAt) continue;
    await db.update(schema.expenseProfiles).set({ archivedAt: now, updatedAt: now }).where(eq(schema.expenseProfiles.id, row.id));
    archived += 1;
  }
  return archived;
}

async function clearTransactionRecurringTags(db: MirrorDatabase, subscriptionId: string) {
  await db
    .update(schema.transactions)
    .set({ isRecurring: false, recurringGroupId: null, updatedAt: Date.now() })
    .where(eq(schema.transactions.recurringGroupId, subscriptionId));
}

async function patchPFMRow(
  table: typeof schema.incomeStreams | typeof schema.expenseProfiles | typeof schema.recurringSubscriptions,
  id: string,
  patch: Record<string, number | null>,
  db?: MirrorDatabase
) {
  const database = db ?? (await ensureMirrorDatabaseReady());
  await database.update(table).set({ ...patch, updatedAt: Date.now() }).where(eq(table.id, id));
}

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}
