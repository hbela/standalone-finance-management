// Row shapes for the mobile SQLite tables. These mirror the column layout
// drizzle expects for each `sqliteTable` defined in ./schema.ts — the schema
// is the source of truth and column drift is caught by typecheck on the
// repository call sites.

export type UserRow = {
  id: string;
  clerkUserId: string;
  country: string;
  locale: string;
  baseCurrency: string;
  createdAt: number;
  updatedAt: number;
};

export type AccountRow = {
  id: string;
  userId: string;
  source: string;
  bankId: string | null;
  bankKey: string | null;
  providerAccountId: string | null;
  credentialsId: string | null;
  name: string;
  currency: string;
  type: string;
  currentBalance: number;
  availableBalance: number | null;
  institutionName: string | null;
  holderName: string | null;
  iban: string | null;
  bban: string | null;
  lastSyncedAt: number | null;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type TransactionRow = {
  id: string;
  userId: string;
  accountId: string;
  source: string;
  providerTransactionId: string | null;
  postedAt: number;
  amount: number;
  currency: string;
  baseCurrencyAmount: number | null;
  description: string;
  merchant: string | null;
  categoryId: string | null;
  tinkCategoryCode: string | null;
  importBatchId: string | null;
  type: string;
  isRecurring: boolean;
  recurringGroupId: string | null;
  isExcludedFromReports: boolean;
  transferMatchId: string | null;
  dedupeHash: string;
  status: string | null;
  notes: string | null;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type CategoryRow = {
  id: string;
  userId: string;
  name: string;
  tinkCategoryCode: string | null;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type LiabilityRow = {
  id: string;
  userId: string;
  linkedAccountId: string | null;
  name: string;
  institution: string;
  type: string;
  currency: string;
  originalPrincipal: number;
  outstandingBalance: number;
  interestRate: number;
  paymentAmount: number;
  paymentFrequency: string;
  nextDueDate: string;
  rateType: string;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type ImportBatchRow = {
  id: string;
  userId: string;
  accountId: string;
  source: string;
  status: string;
  sourceName: string | null;
  rowCount: number;
  importedCount: number;
  skippedCount: number;
  columnMapping: string; // JSON-serialized
  dateFormat: string;
  createdAt: number;
  updatedAt: number;
};

export type BalanceSnapshotRow = {
  id: string;
  userId: string;
  accountId: string;
  snapshotDate: string;
  bookedBalance: number;
  availableBalance: number | null;
  currency: string;
  createdAt: number;
};

export type RecurringSubscriptionRow = {
  id: string;
  userId: string;
  accountId: string;
  groupKey: string;
  merchant: string;
  category: string | null;
  type: string;
  currency: string;
  averageAmount: number;
  monthlyAmount: number;
  frequency: string;
  confidence: string;
  transactionCount: number;
  firstSeenAt: number;
  lastSeenAt: number;
  nextExpectedAt: number | null;
  confirmedAt: number | null;
  dismissedAt: number | null;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type IncomeStreamRow = {
  id: string;
  userId: string;
  accountId: string;
  groupKey: string;
  employerName: string;
  currency: string;
  averageAmount: number;
  monthlyAverage: number;
  frequency: string;
  confidence: string;
  transactionCount: number;
  firstSeenAt: number;
  lastSeenAt: number;
  nextExpectedAt: number | null;
  confirmedAt: number | null;
  dismissedAt: number | null;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type ExpenseProfileRow = {
  id: string;
  userId: string;
  groupKey: string;
  category: string;
  currency: string;
  monthlyAverage: number;
  totalAmount: number;
  monthsObserved: number;
  transactionCount: number;
  firstSeenAt: number;
  lastSeenAt: number;
  confidence: string;
  confirmedAt: number | null;
  dismissedAt: number | null;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type FxRateRow = {
  baseCurrency: string;
  ratesJson: string;
  source: string;
  fetchedAt: number;
  updatedAt: number;
};
