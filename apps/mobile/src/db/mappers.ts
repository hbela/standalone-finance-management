import type { Doc } from "../../../../convex/_generated/dataModel";

// Shapes produced by the mappers — they are exactly the row shape drizzle expects
// for the corresponding `sqliteTable`. We do not import the inferred drizzle types here
// because that creates a heavy dependency cycle at no real safety benefit; the schema
// file is the single source of truth and column drift is caught by typecheck on the
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

const nullable = <T>(value: T | undefined): T | null => (value === undefined ? null : value);

export function userToRow(doc: Doc<"users">): UserRow {
  return {
    id: doc._id,
    clerkUserId: doc.clerkUserId,
    country: doc.country,
    locale: doc.locale,
    baseCurrency: doc.baseCurrency,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function accountToRow(doc: Doc<"accounts">): AccountRow {
  return {
    id: doc._id,
    userId: doc.userId,
    source: doc.source,
    bankId: nullable(doc.bankId),
    bankKey: nullable(doc.bankKey),
    providerAccountId: nullable(doc.providerAccountId),
    credentialsId: nullable(doc.credentialsId),
    name: doc.name,
    currency: doc.currency,
    type: doc.type,
    currentBalance: doc.currentBalance,
    availableBalance: nullable(doc.availableBalance),
    institutionName: nullable(doc.institutionName),
    holderName: nullable(doc.holderName),
    iban: nullable(doc.iban),
    bban: nullable(doc.bban),
    lastSyncedAt: nullable(doc.lastSyncedAt),
    archivedAt: nullable(doc.archivedAt),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function transactionToRow(doc: Doc<"transactions">): TransactionRow {
  return {
    id: doc._id,
    userId: doc.userId,
    accountId: doc.accountId,
    source: doc.source,
    providerTransactionId: nullable(doc.providerTransactionId),
    postedAt: doc.postedAt,
    amount: doc.amount,
    currency: doc.currency,
    baseCurrencyAmount: nullable(doc.baseCurrencyAmount),
    description: doc.description,
    merchant: nullable(doc.merchant),
    categoryId: nullable(doc.categoryId),
    tinkCategoryCode: nullable(doc.tinkCategoryCode),
    importBatchId: nullable(doc.importBatchId),
    type: doc.type,
    isRecurring: doc.isRecurring,
    recurringGroupId: nullable(doc.recurringGroupId),
    isExcludedFromReports: doc.isExcludedFromReports,
    transferMatchId: nullable(doc.transferMatchId),
    dedupeHash: doc.dedupeHash,
    status: nullable(doc.status),
    notes: nullable(doc.notes),
    archivedAt: nullable(doc.archivedAt),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function categoryToRow(doc: Doc<"categories">): CategoryRow {
  return {
    id: doc._id,
    userId: doc.userId,
    name: doc.name,
    tinkCategoryCode: nullable(doc.tinkCategoryCode),
    archivedAt: nullable(doc.archivedAt),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function liabilityToRow(doc: Doc<"liabilities">): LiabilityRow {
  return {
    id: doc._id,
    userId: doc.userId,
    linkedAccountId: nullable(doc.linkedAccountId),
    name: doc.name,
    institution: doc.institution,
    type: doc.type,
    currency: doc.currency,
    originalPrincipal: doc.originalPrincipal,
    outstandingBalance: doc.outstandingBalance,
    interestRate: doc.interestRate,
    paymentAmount: doc.paymentAmount,
    paymentFrequency: doc.paymentFrequency,
    nextDueDate: doc.nextDueDate,
    rateType: doc.rateType,
    archivedAt: nullable(doc.archivedAt),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function importBatchToRow(doc: Doc<"importBatches">): ImportBatchRow {
  return {
    id: doc._id,
    userId: doc.userId,
    accountId: doc.accountId,
    source: doc.source,
    status: doc.status,
    sourceName: nullable(doc.sourceName),
    rowCount: doc.rowCount,
    importedCount: doc.importedCount,
    skippedCount: doc.skippedCount,
    columnMapping: JSON.stringify(doc.columnMapping ?? {}),
    dateFormat: doc.dateFormat,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function balanceSnapshotToRow(doc: Doc<"balanceSnapshots">): BalanceSnapshotRow {
  return {
    id: doc._id,
    userId: doc.userId,
    accountId: doc.accountId,
    snapshotDate: doc.snapshotDate,
    bookedBalance: doc.bookedBalance,
    availableBalance: nullable(doc.availableBalance),
    currency: doc.currency,
    createdAt: doc.createdAt,
  };
}

export function recurringSubscriptionToRow(
  doc: Doc<"recurringSubscriptions">
): RecurringSubscriptionRow {
  return {
    id: doc._id,
    userId: doc.userId,
    accountId: doc.accountId,
    groupKey: doc.groupKey,
    merchant: doc.merchant,
    category: nullable(doc.category),
    type: doc.type,
    currency: doc.currency,
    averageAmount: doc.averageAmount,
    monthlyAmount: doc.monthlyAmount,
    frequency: doc.frequency,
    confidence: doc.confidence,
    transactionCount: doc.transactionCount,
    firstSeenAt: doc.firstSeenAt,
    lastSeenAt: doc.lastSeenAt,
    nextExpectedAt: nullable(doc.nextExpectedAt),
    confirmedAt: nullable(doc.confirmedAt),
    dismissedAt: nullable(doc.dismissedAt),
    archivedAt: nullable(doc.archivedAt),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function incomeStreamToRow(doc: Doc<"incomeStreams">): IncomeStreamRow {
  return {
    id: doc._id,
    userId: doc.userId,
    accountId: doc.accountId,
    groupKey: doc.groupKey,
    employerName: doc.employerName,
    currency: doc.currency,
    averageAmount: doc.averageAmount,
    monthlyAverage: doc.monthlyAverage,
    frequency: doc.frequency,
    confidence: doc.confidence,
    transactionCount: doc.transactionCount,
    firstSeenAt: doc.firstSeenAt,
    lastSeenAt: doc.lastSeenAt,
    nextExpectedAt: nullable(doc.nextExpectedAt),
    confirmedAt: nullable(doc.confirmedAt),
    dismissedAt: nullable(doc.dismissedAt),
    archivedAt: nullable(doc.archivedAt),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function expenseProfileToRow(doc: Doc<"expenseProfiles">): ExpenseProfileRow {
  return {
    id: doc._id,
    userId: doc.userId,
    groupKey: doc.groupKey,
    category: doc.category,
    currency: doc.currency,
    monthlyAverage: doc.monthlyAverage,
    totalAmount: doc.totalAmount,
    monthsObserved: doc.monthsObserved,
    transactionCount: doc.transactionCount,
    firstSeenAt: doc.firstSeenAt,
    lastSeenAt: doc.lastSeenAt,
    confidence: doc.confidence,
    confirmedAt: nullable(doc.confirmedAt),
    dismissedAt: nullable(doc.dismissedAt),
    archivedAt: nullable(doc.archivedAt),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
