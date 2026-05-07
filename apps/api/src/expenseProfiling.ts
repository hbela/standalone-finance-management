export type ExpenseConfidence = "high" | "medium";

export type ExpenseProfileTransaction = {
  amount: number;
  currency: string;
  type: string;
  postedAt: number;
  categoryId?: string;
  tinkCategoryCode?: string;
  isExcludedFromReports?: boolean;
  transferMatchId?: string;
  archivedAt?: number;
};

export type ExpenseProfile = {
  groupKey: string;
  category: string;
  currency: string;
  monthlyAverage: number;
  totalAmount: number;
  monthsObserved: number;
  transactionCount: number;
  firstSeenAt: number;
  lastSeenAt: number;
  confidence: ExpenseConfidence;
};

export type ComputeExpenseProfilesOptions = {
  lookbackMonths?: number;
  now?: number;
};

const DEFAULT_LOOKBACK_MONTHS = 6;

export function computeExpenseProfiles(
  transactions: ExpenseProfileTransaction[],
  options: ComputeExpenseProfilesOptions = {}
): ExpenseProfile[] {
  const lookbackMonths = options.lookbackMonths ?? DEFAULT_LOOKBACK_MONTHS;
  const now = options.now ?? Date.now();
  const cutoff = subtractMonthsUtc(now, lookbackMonths);

  const buckets = new Map<
    string,
    {
      category: string;
      currency: string;
      perMonth: Map<string, number>;
      transactionCount: number;
      firstSeenAt: number;
      lastSeenAt: number;
    }
  >();

  for (const transaction of transactions) {
    if (!isExpenseCandidate(transaction, cutoff)) continue;

    const category = pickCategoryLabel(transaction);
    const groupKey = `${normalizeCategoryKey(category)}|${transaction.currency}`;
    const monthKey = monthKeyOf(transaction.postedAt);

    const existing = buckets.get(groupKey);
    if (existing) {
      existing.perMonth.set(monthKey, (existing.perMonth.get(monthKey) ?? 0) + transaction.amount);
      existing.transactionCount += 1;
      existing.firstSeenAt = Math.min(existing.firstSeenAt, transaction.postedAt);
      existing.lastSeenAt = Math.max(existing.lastSeenAt, transaction.postedAt);
    } else {
      buckets.set(groupKey, {
        category,
        currency: transaction.currency,
        perMonth: new Map([[monthKey, transaction.amount]]),
        transactionCount: 1,
        firstSeenAt: transaction.postedAt,
        lastSeenAt: transaction.postedAt
      });
    }
  }

  const profiles: ExpenseProfile[] = [];
  for (const [groupKey, bucket] of buckets) {
    const monthsObserved = bucket.perMonth.size;
    if (monthsObserved < 2) continue;

    const monthlyTotals = [...bucket.perMonth.values()];
    const totalAmount = monthlyTotals.reduce((sum, value) => sum + value, 0);
    const monthlyAverage = totalAmount / monthsObserved;

    const confidence: ExpenseConfidence = monthsObserved >= 3 ? "high" : "medium";

    profiles.push({
      groupKey,
      category: bucket.category,
      currency: bucket.currency,
      monthlyAverage,
      totalAmount,
      monthsObserved,
      transactionCount: bucket.transactionCount,
      firstSeenAt: bucket.firstSeenAt,
      lastSeenAt: bucket.lastSeenAt,
      confidence
    });
  }

  profiles.sort((left, right) => left.monthlyAverage - right.monthlyAverage);
  return profiles;
}

function isExpenseCandidate(transaction: ExpenseProfileTransaction, cutoff: number) {
  return (
    !transaction.archivedAt &&
    !transaction.isExcludedFromReports &&
    !transaction.transferMatchId &&
    transaction.type === "expense" &&
    transaction.amount < 0 &&
    Number.isFinite(transaction.postedAt) &&
    transaction.postedAt >= cutoff
  );
}

export function pickCategoryLabel(transaction: ExpenseProfileTransaction) {
  const fromApp = transaction.categoryId?.trim();
  if (fromApp && fromApp.length > 0) return fromApp;
  const fromTink = transaction.tinkCategoryCode?.trim();
  if (fromTink && fromTink.length > 0) return fromTink;
  return "Other";
}

export function normalizeCategoryKey(category: string) {
  return category
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function monthKeyOf(epochMs: number) {
  const date = new Date(epochMs);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function subtractMonthsUtc(epochMs: number, months: number) {
  const date = new Date(epochMs);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date.getTime();
}
