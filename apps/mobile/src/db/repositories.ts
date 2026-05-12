import { eq, getTableColumns, notInArray, sql } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";

import type { MirrorDatabase } from "./client";
import type {
  AccountRow,
  BalanceSnapshotRow,
  CategoryRow,
  ExpenseProfileRow,
  FxRateRow,
  ImportBatchRow,
  IncomeStreamRow,
  LiabilityRow,
  RecurringSubscriptionRow,
  TransactionRow,
  UserRow,
} from "./mappers";
import * as schema from "./schema";

// Generic upsert-then-prune. Inserts/updates every row by `id`, then removes any rows
// whose id is not in the incoming set. Equivalent to "replace all rows for this table
// to match the incoming snapshot" — what Convex query mirroring needs.
async function mirrorTableRows(
  db: MirrorDatabase,
  table: SQLiteTable,
  rows: Array<Record<string, unknown> & { id: string }>
): Promise<void> {
  const cols = getTableColumns(table);
  const idColumn = (cols as Record<string, SQLiteColumn>).id;
  if (!idColumn) {
    throw new Error("Mirrored table is missing an 'id' column");
  }

  const setClause: Record<string, unknown> = {};
  for (const [tsName, col] of Object.entries(cols) as Array<[string, SQLiteColumn]>) {
    if (tsName === "id") continue;
    setClause[tsName] = sql.raw(`excluded."${col.name}"`);
  }

  if (rows.length > 0) {
    await db
      .insert(table)
      .values(rows)
      .onConflictDoUpdate({ target: idColumn, set: setClause });
    const ids = rows.map((r) => r.id);
    await db.delete(table).where(notInArray(idColumn, ids));
  } else {
    await db.delete(table);
  }
}

async function upsertTableRows(
  db: MirrorDatabase,
  table: SQLiteTable,
  rows: Array<Record<string, unknown> & { id: string }>
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const cols = getTableColumns(table);
  const idColumn = (cols as Record<string, SQLiteColumn>).id;
  if (!idColumn) {
    throw new Error("Mirrored table is missing an 'id' column");
  }

  const setClause: Record<string, unknown> = {};
  for (const [tsName, col] of Object.entries(cols) as Array<[string, SQLiteColumn]>) {
    if (tsName === "id") continue;
    setClause[tsName] = sql.raw(`excluded."${col.name}"`);
  }

  await db
    .insert(table)
    .values(rows)
    .onConflictDoUpdate({ target: idColumn, set: setClause });
}

export const usersRepo = {
  mirror: (db: MirrorDatabase, rows: UserRow[]) => mirrorTableRows(db, schema.users, rows),
  upsert: (db: MirrorDatabase, rows: UserRow[]) => upsertTableRows(db, schema.users, rows),
  list: (db: MirrorDatabase) => db.select().from(schema.users).all(),
  count: (db: MirrorDatabase) =>
    db.select({ count: sql<number>`count(*)` }).from(schema.users).get(),
  byClerkId: (db: MirrorDatabase, clerkUserId: string) =>
    db.select().from(schema.users).where(eq(schema.users.clerkUserId, clerkUserId)).get(),
};

export const accountsRepo = {
  mirror: (db: MirrorDatabase, rows: AccountRow[]) =>
    mirrorTableRows(db, schema.accounts, rows),
  upsert: (db: MirrorDatabase, rows: AccountRow[]) =>
    upsertTableRows(db, schema.accounts, rows),
  list: (db: MirrorDatabase) => db.select().from(schema.accounts).all(),
  count: (db: MirrorDatabase) =>
    db.select({ count: sql<number>`count(*)` }).from(schema.accounts).get(),
};

export const transactionsRepo = {
  mirror: (db: MirrorDatabase, rows: TransactionRow[]) =>
    mirrorTableRows(db, schema.transactions, rows),
  upsert: (db: MirrorDatabase, rows: TransactionRow[]) =>
    upsertTableRows(db, schema.transactions, rows),
  list: (db: MirrorDatabase) => db.select().from(schema.transactions).all(),
  count: (db: MirrorDatabase) =>
    db.select({ count: sql<number>`count(*)` }).from(schema.transactions).get(),
};

export const categoriesRepo = {
  mirror: (db: MirrorDatabase, rows: CategoryRow[]) =>
    mirrorTableRows(db, schema.categories, rows),
  upsert: (db: MirrorDatabase, rows: CategoryRow[]) =>
    upsertTableRows(db, schema.categories, rows),
  list: (db: MirrorDatabase) => db.select().from(schema.categories).all(),
  count: (db: MirrorDatabase) =>
    db.select({ count: sql<number>`count(*)` }).from(schema.categories).get(),
};

export const liabilitiesRepo = {
  mirror: (db: MirrorDatabase, rows: LiabilityRow[]) =>
    mirrorTableRows(db, schema.liabilities, rows),
  upsert: (db: MirrorDatabase, rows: LiabilityRow[]) =>
    upsertTableRows(db, schema.liabilities, rows),
  list: (db: MirrorDatabase) => db.select().from(schema.liabilities).all(),
  count: (db: MirrorDatabase) =>
    db.select({ count: sql<number>`count(*)` }).from(schema.liabilities).get(),
};

export const importBatchesRepo = {
  mirror: (db: MirrorDatabase, rows: ImportBatchRow[]) =>
    mirrorTableRows(db, schema.importBatches, rows),
  upsert: (db: MirrorDatabase, rows: ImportBatchRow[]) =>
    upsertTableRows(db, schema.importBatches, rows),
  list: (db: MirrorDatabase) => db.select().from(schema.importBatches).all(),
  count: (db: MirrorDatabase) =>
    db.select({ count: sql<number>`count(*)` }).from(schema.importBatches).get(),
};

export const balanceSnapshotsRepo = {
  mirror: (db: MirrorDatabase, rows: BalanceSnapshotRow[]) =>
    mirrorTableRows(db, schema.balanceSnapshots, rows),
  list: (db: MirrorDatabase) => db.select().from(schema.balanceSnapshots).all(),
  count: (db: MirrorDatabase) =>
    db.select({ count: sql<number>`count(*)` }).from(schema.balanceSnapshots).get(),
};

export const recurringSubscriptionsRepo = {
  mirror: (db: MirrorDatabase, rows: RecurringSubscriptionRow[]) =>
    mirrorTableRows(db, schema.recurringSubscriptions, rows),
  upsert: (db: MirrorDatabase, rows: RecurringSubscriptionRow[]) =>
    upsertTableRows(db, schema.recurringSubscriptions, rows),
  list: (db: MirrorDatabase) => db.select().from(schema.recurringSubscriptions).all(),
  count: (db: MirrorDatabase) =>
    db.select({ count: sql<number>`count(*)` }).from(schema.recurringSubscriptions).get(),
};

export const incomeStreamsRepo = {
  mirror: (db: MirrorDatabase, rows: IncomeStreamRow[]) =>
    mirrorTableRows(db, schema.incomeStreams, rows),
  upsert: (db: MirrorDatabase, rows: IncomeStreamRow[]) =>
    upsertTableRows(db, schema.incomeStreams, rows),
  list: (db: MirrorDatabase) => db.select().from(schema.incomeStreams).all(),
  count: (db: MirrorDatabase) =>
    db.select({ count: sql<number>`count(*)` }).from(schema.incomeStreams).get(),
};

export const expenseProfilesRepo = {
  mirror: (db: MirrorDatabase, rows: ExpenseProfileRow[]) =>
    mirrorTableRows(db, schema.expenseProfiles, rows),
  upsert: (db: MirrorDatabase, rows: ExpenseProfileRow[]) =>
    upsertTableRows(db, schema.expenseProfiles, rows),
  list: (db: MirrorDatabase) => db.select().from(schema.expenseProfiles).all(),
  count: (db: MirrorDatabase) =>
    db.select({ count: sql<number>`count(*)` }).from(schema.expenseProfiles).get(),
};

export const fxRatesRepo = {
  upsert: (db: MirrorDatabase, rows: FxRateRow[]) =>
    rows.length === 0
      ? Promise.resolve()
      : db
          .insert(schema.fxRates)
          .values(rows)
          .onConflictDoUpdate({
            target: schema.fxRates.baseCurrency,
            set: {
              ratesJson: sql.raw('excluded."rates_json"'),
              source: sql.raw('excluded."source"'),
              fetchedAt: sql.raw('excluded."fetched_at"'),
              updatedAt: sql.raw('excluded."updated_at"'),
            },
          }),
  list: (db: MirrorDatabase) => db.select().from(schema.fxRates).all(),
  byBaseCurrency: (db: MirrorDatabase, baseCurrency: string) =>
    db.select().from(schema.fxRates).where(eq(schema.fxRates.baseCurrency, baseCurrency)).get(),
};

export type MirrorRepoName =
  | "users"
  | "accounts"
  | "transactions"
  | "categories"
  | "liabilities"
  | "importBatches"
  | "balanceSnapshots"
  | "recurringSubscriptions"
  | "incomeStreams"
  | "expenseProfiles";

export const ALL_REPOS = {
  users: usersRepo,
  accounts: accountsRepo,
  transactions: transactionsRepo,
  categories: categoriesRepo,
  liabilities: liabilitiesRepo,
  importBatches: importBatchesRepo,
  balanceSnapshots: balanceSnapshotsRepo,
  recurringSubscriptions: recurringSubscriptionsRepo,
  incomeStreams: incomeStreamsRepo,
  expenseProfiles: expenseProfilesRepo,
} as const;
