export type RecurringFrequency = "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";

export type RecurringConfidence = "high" | "medium";

export type DetectableTransaction = {
  _id: string;
  accountId: string;
  amount: number;
  currency: string;
  type: string;
  merchant?: string;
  description?: string;
  categoryId?: string;
  tinkCategoryCode?: string;
  postedAt: number;
  isExcludedFromReports?: boolean;
  transferMatchId?: string;
  archivedAt?: number;
};

export type DetectedGroup = {
  groupKey: string;
  accountId: string;
  merchant: string;
  category?: string;
  type: string;
  currency: string;
  averageAmount: number;
  monthlyAmount: number;
  frequency: RecurringFrequency;
  confidence: RecurringConfidence;
  firstSeenAt: number;
  lastSeenAt: number;
  nextExpectedAt: number;
  transactionIds: string[];
};

const FREQUENCY_WINDOWS: Array<{
  frequency: RecurringFrequency;
  minDays: number;
  maxDays: number;
  fallbackDays: number;
}> = [
  { frequency: "weekly", minDays: 5, maxDays: 9, fallbackDays: 7 },
  { frequency: "biweekly", minDays: 12, maxDays: 17, fallbackDays: 14 },
  { frequency: "monthly", minDays: 25, maxDays: 36, fallbackDays: 30 },
  { frequency: "quarterly", minDays: 82, maxDays: 100, fallbackDays: 91 },
  { frequency: "yearly", minDays: 350, maxDays: 380, fallbackDays: 365 }
];

export const MONTHLY_MULTIPLIERS: Record<RecurringFrequency, number> = {
  weekly: 30 / 7,
  biweekly: 30 / 14,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12
};

export function detectRecurringGroups(
  transactions: DetectableTransaction[]
): DetectedGroup[] {
  const buckets = new Map<string, DetectableTransaction[]>();

  for (const transaction of transactions) {
    if (!isReviewable(transaction)) continue;

    const merchantKey = normalizeForKey(transaction.merchant ?? transaction.description ?? "");
    const categoryKey = normalizeForKey(
      transaction.categoryId ?? transaction.tinkCategoryCode ?? ""
    );
    const sign = transaction.amount === 0 ? 0 : transaction.amount < 0 ? -1 : 1;
    const key = [merchantKey, categoryKey, transaction.type, transaction.currency, sign].join("|");

    const existing = buckets.get(key);
    if (existing) {
      existing.push(transaction);
    } else {
      buckets.set(key, [transaction]);
    }
  }

  const groups: DetectedGroup[] = [];
  for (const [key, list] of buckets) {
    const sorted = list
      .filter((tx) => Number.isFinite(tx.postedAt))
      .sort((left, right) => left.postedAt - right.postedAt);

    if (sorted.length < 2) continue;

    for (const amountBucket of bucketByAmount(sorted)) {
      if (amountBucket.length < 2) continue;

      const intervals = consecutiveDayDeltas(amountBucket);
      const frequency = pickFrequency(intervals);
      if (!frequency) continue;

      const averageAmount =
        amountBucket.reduce((sum, tx) => sum + tx.amount, 0) / amountBucket.length;
      const last = amountBucket[amountBucket.length - 1];
      const first = amountBucket[0];
      const allInWindow = intervals.every(
        (days) => days >= frequency.minDays && days <= frequency.maxDays
      );
      const confidence: RecurringConfidence =
        amountBucket.length >= 3 && allInWindow ? "high" : "medium";
      const nextExpectedAt = addDuration(last.postedAt, frequency.frequency, frequency.fallbackDays);
      const monthlyAmount = averageAmount * MONTHLY_MULTIPLIERS[frequency.frequency];

      groups.push({
        groupKey: key,
        accountId: last.accountId,
        merchant: last.merchant ?? last.description ?? "",
        category: last.categoryId ?? last.tinkCategoryCode ?? undefined,
        type: last.type,
        currency: last.currency,
        averageAmount,
        monthlyAmount,
        frequency: frequency.frequency,
        confidence,
        firstSeenAt: first.postedAt,
        lastSeenAt: last.postedAt,
        nextExpectedAt,
        transactionIds: amountBucket.map((tx) => tx._id)
      });
    }
  }

  return groups;
}

function isReviewable(transaction: DetectableTransaction) {
  return (
    !transaction.archivedAt &&
    !transaction.isExcludedFromReports &&
    !transaction.transferMatchId &&
    transaction.type !== "transfer" &&
    transaction.type !== "refund"
  );
}

export function normalizeForKey(value: string | undefined) {
  if (!value) return "";
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(card|payment|purchase|pos|transaction|transfer|online|bank)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bucketByAmount(transactions: DetectableTransaction[]): DetectableTransaction[][] {
  return transactions.reduce<DetectableTransaction[][]>((buckets, transaction) => {
    const bucket = buckets.find((candidate) =>
      candidate.some((member) => similarAmounts(member.amount, transaction.amount))
    );
    if (bucket) {
      bucket.push(transaction);
    } else {
      buckets.push([transaction]);
    }
    return buckets;
  }, []);
}

function similarAmounts(left: number, right: number) {
  const absLeft = Math.abs(left);
  const absRight = Math.abs(right);
  const allowedDrift = Math.max(absLeft, absRight) * 0.08;
  return Math.abs(absLeft - absRight) <= Math.max(allowedDrift, 1);
}

function consecutiveDayDeltas(transactions: DetectableTransaction[]) {
  return transactions.slice(1).map((tx, index) => {
    const previous = transactions[index];
    return Math.round((tx.postedAt - previous.postedAt) / 86_400_000);
  });
}

function pickFrequency(intervals: number[]) {
  const matches = FREQUENCY_WINDOWS.map((window) => ({
    ...window,
    matchCount: intervals.filter((days) => days >= window.minDays && days <= window.maxDays).length
  }))
    .filter((window) => window.matchCount > 0)
    .sort((left, right) => right.matchCount - left.matchCount);

  const best = matches[0];
  if (!best) return null;
  return best.matchCount / intervals.length >= 0.66 ? best : null;
}

function addDuration(epochMs: number, frequency: RecurringFrequency, fallbackDays: number) {
  const date = new Date(epochMs);
  if (frequency === "monthly") {
    date.setUTCMonth(date.getUTCMonth() + 1);
  } else if (frequency === "quarterly") {
    date.setUTCMonth(date.getUTCMonth() + 3);
  } else if (frequency === "yearly") {
    date.setUTCFullYear(date.getUTCFullYear() + 1);
  } else {
    date.setUTCDate(date.getUTCDate() + fallbackDays);
  }
  return date.getTime();
}
