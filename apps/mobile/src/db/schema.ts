import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// All Convex IDs are stored as TEXT primary keys.
// Numeric timestamps stay as INTEGER (ms epoch). Money amounts stay as REAL (parity with Convex v.number()).
// JSON-shaped fields (records, arrays) are serialized as TEXT.

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull(),
  country: text("country").notNull(),
  locale: text("locale").notNull(),
  baseCurrency: text("base_currency").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  mirroredAt: integer("mirrored_at").notNull().default(sql`(unixepoch() * 1000)`),
});

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    source: text("source").notNull(),
    bankId: text("bank_id"),
    bankKey: text("bank_key"),
    providerAccountId: text("provider_account_id"),
    credentialsId: text("credentials_id"),
    name: text("name").notNull(),
    currency: text("currency").notNull(),
    type: text("type").notNull(),
    currentBalance: real("current_balance").notNull(),
    availableBalance: real("available_balance"),
    institutionName: text("institution_name"),
    holderName: text("holder_name"),
    iban: text("iban"),
    bban: text("bban"),
    lastSyncedAt: integer("last_synced_at"),
    archivedAt: integer("archived_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    mirroredAt: integer("mirrored_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (table) => ({
    byUserId: index("accounts_by_user_id").on(table.userId),
  })
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    accountId: text("account_id").notNull(),
    source: text("source").notNull(),
    providerTransactionId: text("provider_transaction_id"),
    postedAt: integer("posted_at").notNull(),
    amount: real("amount").notNull(),
    currency: text("currency").notNull(),
    baseCurrencyAmount: real("base_currency_amount"),
    description: text("description").notNull(),
    merchant: text("merchant"),
    categoryId: text("category_id"),
    tinkCategoryCode: text("tink_category_code"),
    importBatchId: text("import_batch_id"),
    type: text("type").notNull(),
    isRecurring: integer("is_recurring", { mode: "boolean" }).notNull(),
    recurringGroupId: text("recurring_group_id"),
    isExcludedFromReports: integer("is_excluded_from_reports", { mode: "boolean" }).notNull(),
    transferMatchId: text("transfer_match_id"),
    dedupeHash: text("dedupe_hash").notNull(),
    status: text("status"),
    notes: text("notes"),
    archivedAt: integer("archived_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    mirroredAt: integer("mirrored_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (table) => ({
    byUserId: index("transactions_by_user_id").on(table.userId),
    byAccountId: index("transactions_by_account_id").on(table.accountId),
    byDedupeHash: index("transactions_by_dedupe_hash").on(table.dedupeHash),
  })
);

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    tinkCategoryCode: text("tink_category_code"),
    archivedAt: integer("archived_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    mirroredAt: integer("mirrored_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (table) => ({
    byUserId: index("categories_by_user_id").on(table.userId),
  })
);

export const liabilities = sqliteTable(
  "liabilities",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    linkedAccountId: text("linked_account_id"),
    name: text("name").notNull(),
    institution: text("institution").notNull(),
    type: text("type").notNull(),
    currency: text("currency").notNull(),
    originalPrincipal: real("original_principal").notNull(),
    outstandingBalance: real("outstanding_balance").notNull(),
    interestRate: real("interest_rate").notNull(),
    paymentAmount: real("payment_amount").notNull(),
    paymentFrequency: text("payment_frequency").notNull(),
    nextDueDate: text("next_due_date").notNull(),
    rateType: text("rate_type").notNull(),
    archivedAt: integer("archived_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    mirroredAt: integer("mirrored_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (table) => ({
    byUserId: index("liabilities_by_user_id").on(table.userId),
  })
);

export const importBatches = sqliteTable(
  "import_batches",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    accountId: text("account_id").notNull(),
    source: text("source").notNull(),
    status: text("status").notNull(),
    sourceName: text("source_name"),
    rowCount: integer("row_count").notNull(),
    importedCount: integer("imported_count").notNull(),
    skippedCount: integer("skipped_count").notNull(),
    columnMapping: text("column_mapping").notNull(), // JSON record
    dateFormat: text("date_format").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    mirroredAt: integer("mirrored_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (table) => ({
    byUserId: index("import_batches_by_user_id").on(table.userId),
    byAccountId: index("import_batches_by_account_id").on(table.accountId),
  })
);

export const balanceSnapshots = sqliteTable(
  "balance_snapshots",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    accountId: text("account_id").notNull(),
    snapshotDate: text("snapshot_date").notNull(),
    bookedBalance: real("booked_balance").notNull(),
    availableBalance: real("available_balance"),
    currency: text("currency").notNull(),
    createdAt: integer("created_at").notNull(),
    mirroredAt: integer("mirrored_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (table) => ({
    byUserId: index("balance_snapshots_by_user_id").on(table.userId),
    byAccountDate: index("balance_snapshots_by_account_date").on(
      table.accountId,
      table.snapshotDate
    ),
  })
);

export const recurringSubscriptions = sqliteTable(
  "recurring_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    accountId: text("account_id").notNull(),
    groupKey: text("group_key").notNull(),
    merchant: text("merchant").notNull(),
    category: text("category"),
    type: text("type").notNull(),
    currency: text("currency").notNull(),
    averageAmount: real("average_amount").notNull(),
    monthlyAmount: real("monthly_amount").notNull(),
    frequency: text("frequency").notNull(),
    confidence: text("confidence").notNull(),
    transactionCount: integer("transaction_count").notNull(),
    firstSeenAt: integer("first_seen_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
    nextExpectedAt: integer("next_expected_at"),
    confirmedAt: integer("confirmed_at"),
    dismissedAt: integer("dismissed_at"),
    archivedAt: integer("archived_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    mirroredAt: integer("mirrored_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (table) => ({
    byUserId: index("recurring_subscriptions_by_user_id").on(table.userId),
    byUserGroupKey: index("recurring_subscriptions_by_user_group_key").on(
      table.userId,
      table.groupKey
    ),
  })
);

export const incomeStreams = sqliteTable(
  "income_streams",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    accountId: text("account_id").notNull(),
    groupKey: text("group_key").notNull(),
    employerName: text("employer_name").notNull(),
    currency: text("currency").notNull(),
    averageAmount: real("average_amount").notNull(),
    monthlyAverage: real("monthly_average").notNull(),
    frequency: text("frequency").notNull(),
    confidence: text("confidence").notNull(),
    transactionCount: integer("transaction_count").notNull(),
    firstSeenAt: integer("first_seen_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
    nextExpectedAt: integer("next_expected_at"),
    confirmedAt: integer("confirmed_at"),
    dismissedAt: integer("dismissed_at"),
    archivedAt: integer("archived_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    mirroredAt: integer("mirrored_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (table) => ({
    byUserId: index("income_streams_by_user_id").on(table.userId),
    byUserGroupKey: index("income_streams_by_user_group_key").on(table.userId, table.groupKey),
  })
);

export const expenseProfiles = sqliteTable(
  "expense_profiles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    groupKey: text("group_key").notNull(),
    category: text("category").notNull(),
    currency: text("currency").notNull(),
    monthlyAverage: real("monthly_average").notNull(),
    totalAmount: real("total_amount").notNull(),
    monthsObserved: integer("months_observed").notNull(),
    transactionCount: integer("transaction_count").notNull(),
    firstSeenAt: integer("first_seen_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
    confidence: text("confidence").notNull(),
    confirmedAt: integer("confirmed_at"),
    dismissedAt: integer("dismissed_at"),
    archivedAt: integer("archived_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    mirroredAt: integer("mirrored_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (table) => ({
    byUserId: index("expense_profiles_by_user_id").on(table.userId),
    byUserGroupKey: index("expense_profiles_by_user_group_key").on(
      table.userId,
      table.groupKey
    ),
  })
);

export const ALL_MIRRORED_TABLES = [
  users,
  accounts,
  transactions,
  categories,
  liabilities,
  importBatches,
  balanceSnapshots,
  recurringSubscriptions,
  incomeStreams,
  expenseProfiles,
] as const;
