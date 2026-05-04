import type { Transaction } from "../data/types";

export type RecurringInterval = "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";

export type RecurringCandidate = {
  id: string;
  merchant: string;
  category: string;
  type: Transaction["type"];
  currency: Transaction["currency"];
  averageAmount: number;
  interval: RecurringInterval;
  confidence: "high" | "medium";
  nextExpectedDate: string;
  transactions: Transaction[];
};

const intervalWindows: Array<{ interval: RecurringInterval; minDays: number; maxDays: number; days: number }> = [
  { interval: "weekly", minDays: 5, maxDays: 9, days: 7 },
  { interval: "biweekly", minDays: 12, maxDays: 17, days: 14 },
  { interval: "monthly", minDays: 25, maxDays: 36, days: 30 },
  { interval: "quarterly", minDays: 82, maxDays: 100, days: 91 },
  { interval: "yearly", minDays: 350, maxDays: 380, days: 365 }
];

export function detectRecurringCandidates(transactions: Transaction[]): RecurringCandidate[] {
  const groups = new Map<string, Transaction[]>();

  for (const transaction of transactions) {
    if (!isReviewableTransaction(transaction)) {
      continue;
    }

    const key = [
      normalizeRecurringText(transaction.merchant || transaction.description),
      normalizeRecurringText(transaction.category),
      transaction.type,
      transaction.currency,
      Math.sign(transaction.amount)
    ].join("|");
    groups.set(key, [...(groups.get(key) ?? []), transaction]);
  }

  return [...groups.entries()]
    .flatMap(([key, groupedTransactions]) => detectGroupCandidates(key, groupedTransactions))
    .sort((left, right) => {
      const rightDate = Date.parse(right.nextExpectedDate);
      const leftDate = Date.parse(left.nextExpectedDate);
      return leftDate - rightDate || right.transactions.length - left.transactions.length;
    });
}

function detectGroupCandidates(key: string, groupedTransactions: Transaction[]) {
  const sortedTransactions = groupedTransactions
    .filter((transaction) => Number.isFinite(Date.parse(transaction.postedAt)))
    .sort((left, right) => Date.parse(left.postedAt) - Date.parse(right.postedAt));

  if (sortedTransactions.length < 2) {
    return [];
  }

  const amountBuckets = bucketByAmount(sortedTransactions);
  return amountBuckets.flatMap((bucket, bucketIndex) => {
    if (bucket.length < 2) {
      return [];
    }

    const intervals = getIntervals(bucket);
    const interval = chooseRecurringInterval(intervals);
    if (!interval) {
      return [];
    }

    const averageAmount = bucket.reduce((sum, transaction) => sum + transaction.amount, 0) / bucket.length;
    const latestTransaction = bucket[bucket.length - 1];
    const nextExpectedDate = addRecurringInterval(latestTransaction.postedAt, interval.interval, interval.days);
    const confidence: RecurringCandidate["confidence"] =
      bucket.length >= 3 && intervals.every((days) => days >= interval.minDays && days <= interval.maxDays)
      ? "high"
      : "medium";

    return [
      {
        id: `${key}|${bucketIndex}|${interval.interval}`,
        merchant: latestTransaction.merchant || latestTransaction.description,
        category: latestTransaction.category,
        type: latestTransaction.type,
        currency: latestTransaction.currency,
        averageAmount,
        interval: interval.interval,
        confidence,
        nextExpectedDate,
        transactions: bucket
      }
    ];
  });
}

function isReviewableTransaction(transaction: Transaction) {
  return (
    !transaction.isRecurring &&
    !transaction.isExcludedFromReports &&
    !transaction.transferMatchId &&
    !["transfer", "refund"].includes(transaction.type)
  );
}

function bucketByAmount(transactions: Transaction[]) {
  return transactions.reduce<Transaction[][]>((buckets, transaction) => {
    const bucket = buckets.find((candidateBucket) =>
      candidateBucket.some((candidate) => areSimilarAmounts(candidate.amount, transaction.amount))
    );

    if (bucket) {
      bucket.push(transaction);
    } else {
      buckets.push([transaction]);
    }

    return buckets;
  }, []);
}

function areSimilarAmounts(left: number, right: number) {
  const absoluteLeft = Math.abs(left);
  const absoluteRight = Math.abs(right);
  const allowedDrift = Math.max(absoluteLeft, absoluteRight) * 0.08;
  return Math.abs(absoluteLeft - absoluteRight) <= Math.max(allowedDrift, 1);
}

function getIntervals(transactions: Transaction[]) {
  return transactions.slice(1).map((transaction, index) => {
    const previous = transactions[index];
    const days = Date.parse(transaction.postedAt) - Date.parse(previous.postedAt);
    return Math.round(days / 86400000);
  });
}

function chooseRecurringInterval(intervals: number[]) {
  const matches = intervalWindows
    .map((window) => ({
      ...window,
      matches: intervals.filter((days) => days >= window.minDays && days <= window.maxDays).length
    }))
    .filter((window) => window.matches > 0)
    .sort((left, right) => right.matches - left.matches);

  const bestMatch = matches[0];
  if (!bestMatch) {
    return null;
  }

  return bestMatch.matches / intervals.length >= 0.66 ? bestMatch : null;
}

function addRecurringInterval(date: string, interval: RecurringInterval, fallbackDays: number) {
  const nextDate = new Date(Date.parse(date));

  if (interval === "monthly") {
    nextDate.setUTCMonth(nextDate.getUTCMonth() + 1);
  } else if (interval === "quarterly") {
    nextDate.setUTCMonth(nextDate.getUTCMonth() + 3);
  } else if (interval === "yearly") {
    nextDate.setUTCFullYear(nextDate.getUTCFullYear() + 1);
  } else {
    nextDate.setUTCDate(nextDate.getUTCDate() + fallbackDays);
  }

  return nextDate.toISOString().slice(0, 10);
}

function normalizeRecurringText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(card|payment|purchase|pos|transaction|transfer|online|bank)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
