export type RecurringFrequency = "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
export type RecurringConfidence = "high" | "medium";

export type DetectableTransaction = {
  id: string;
  accountId: string;
  amount: number;
  currency: string;
  type: string;
  merchant?: string | null;
  description?: string;
  categoryId?: string | null;
  tinkCategoryCode?: string | null;
  postedAt: number;
  isExcludedFromReports?: boolean;
  transferMatchId?: string | null;
  archivedAt?: number | null;
};

export type DetectedRecurringGroup = {
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
  { frequency: "yearly", minDays: 350, maxDays: 380, fallbackDays: 365 },
];

const MONTHLY_MULTIPLIERS: Record<RecurringFrequency, number> = {
  weekly: 30 / 7,
  biweekly: 30 / 14,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
};

export function detectRecurringGroups(
  transactions: DetectableTransaction[]
): DetectedRecurringGroup[] {
  const buckets = new Map<string, DetectableTransaction[]>();

  for (const transaction of transactions) {
    if (!isRecurringCandidate(transaction)) continue;

    const merchantKey = normalizeForKey(transaction.merchant ?? transaction.description ?? "");
    const categoryKey = normalizeForKey(transaction.categoryId ?? transaction.tinkCategoryCode ?? "");
    const sign = transaction.amount === 0 ? 0 : transaction.amount < 0 ? -1 : 1;
    const key = [merchantKey, categoryKey, transaction.type, transaction.currency, sign].join("|");
    buckets.set(key, [...(buckets.get(key) ?? []), transaction]);
  }

  const groups: DetectedRecurringGroup[] = [];
  for (const [key, list] of buckets) {
    const sorted = list
      .filter((transaction) => Number.isFinite(transaction.postedAt))
      .sort((left, right) => left.postedAt - right.postedAt);
    if (sorted.length < 2) continue;

    for (const amountBucket of bucketByAmount(sorted)) {
      if (amountBucket.length < 2) continue;

      const intervals = consecutiveDayDeltas(amountBucket);
      const frequency = pickFrequency(intervals);
      if (!frequency) continue;

      const averageAmount =
        amountBucket.reduce((sum, transaction) => sum + transaction.amount, 0) /
        amountBucket.length;
      const first = amountBucket[0];
      const last = amountBucket[amountBucket.length - 1];
      const allInWindow = intervals.every(
        (days) => days >= frequency.minDays && days <= frequency.maxDays
      );

      groups.push({
        groupKey: key,
        accountId: last.accountId,
        merchant: last.merchant ?? last.description ?? "",
        category: last.categoryId ?? last.tinkCategoryCode ?? undefined,
        type: last.type,
        currency: last.currency,
        averageAmount,
        monthlyAmount: averageAmount * MONTHLY_MULTIPLIERS[frequency.frequency],
        frequency: frequency.frequency,
        confidence: amountBucket.length >= 3 && allInWindow ? "high" : "medium",
        firstSeenAt: first.postedAt,
        lastSeenAt: last.postedAt,
        nextExpectedAt: addDuration(last.postedAt, frequency.frequency, frequency.fallbackDays),
        transactionIds: amountBucket.map((transaction) => transaction.id),
      });
    }
  }

  return groups;
}

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
  confidence: RecurringConfidence;
};

export function computeExpenseProfiles(
  transactions: DetectableTransaction[],
  options: { lookbackMonths?: number; now?: number } = {}
): ExpenseProfile[] {
  const cutoff = subtractMonthsUtc(options.now ?? Date.now(), options.lookbackMonths ?? 6);
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
    if (
      !isRecurringCandidate(transaction) ||
      transaction.type !== "expense" ||
      transaction.amount >= 0 ||
      transaction.postedAt < cutoff
    ) {
      continue;
    }

    const category = transaction.categoryId?.trim() || transaction.tinkCategoryCode?.trim() || "Other";
    const groupKey = `${normalizeForKey(category)}|${transaction.currency}`;
    const monthKey = new Date(transaction.postedAt).toISOString().slice(0, 7);
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
        lastSeenAt: transaction.postedAt,
      });
    }
  }

  return [...buckets.entries()]
    .map(([groupKey, bucket]) => {
      const monthsObserved = bucket.perMonth.size;
      const totalAmount = [...bucket.perMonth.values()].reduce((sum, value) => sum + value, 0);
      return {
        groupKey,
        category: bucket.category,
        currency: bucket.currency,
        monthlyAverage: totalAmount / monthsObserved,
        totalAmount,
        monthsObserved,
        transactionCount: bucket.transactionCount,
        firstSeenAt: bucket.firstSeenAt,
        lastSeenAt: bucket.lastSeenAt,
        confidence: monthsObserved >= 3 ? "high" : "medium",
      };
    })
    .filter((profile) => profile.monthsObserved >= 2)
    .sort((left, right) => left.monthlyAverage - right.monthlyAverage);
}

export type ForecastEvent = {
  amount: number;
  currency: string;
  frequency: RecurringFrequency;
  nextExpectedAt: number;
};

export type ForecastResult = {
  currency: string;
  horizonDays: number;
  startingBalance: number;
  endingBalance: number;
  totalInflow: number;
  totalOutflow: number;
  points: Array<{
    date: string;
    projectedBalance: number;
    expectedInflow: number;
    expectedOutflow: number;
  }>;
};

const DAY_MS = 86_400_000;
const FREQUENCY_DAYS: Record<RecurringFrequency, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  quarterly: 91,
  yearly: 365,
};

export function computeBalanceForecast(input: {
  startingBalance: number;
  currency: string;
  now: number;
  horizonDays?: number;
  inflows: ForecastEvent[];
  outflows: ForecastEvent[];
  convertToBase: (amount: number, currency: string) => number;
}): ForecastResult {
  const horizonDays = input.horizonDays ?? 30;
  const horizonStart = startOfUtcDay(input.now);
  const horizonEnd = horizonStart + horizonDays * DAY_MS;
  const inflowEvents = expandEvents(input.inflows, horizonStart, horizonEnd, input.convertToBase);
  const outflowEvents = expandEvents(input.outflows, horizonStart, horizonEnd, input.convertToBase);
  const points: ForecastResult["points"] = [];
  let runningBalance = input.startingBalance;
  let totalInflow = 0;
  let totalOutflow = 0;

  for (let dayIndex = 1; dayIndex <= horizonDays; dayIndex += 1) {
    const dayStart = horizonStart + dayIndex * DAY_MS;
    const dayEnd = dayStart + DAY_MS;
    const expectedInflow = sumEventsInRange(inflowEvents, dayStart, dayEnd);
    const expectedOutflow = sumEventsInRange(outflowEvents, dayStart, dayEnd);
    runningBalance += expectedInflow - expectedOutflow;
    totalInflow += expectedInflow;
    totalOutflow += expectedOutflow;
    points.push({
      date: new Date(dayStart).toISOString().slice(0, 10),
      projectedBalance: runningBalance,
      expectedInflow,
      expectedOutflow,
    });
  }

  return {
    currency: input.currency,
    horizonDays,
    startingBalance: input.startingBalance,
    endingBalance: runningBalance,
    totalInflow,
    totalOutflow,
    points,
  };
}

function isRecurringCandidate(transaction: DetectableTransaction) {
  return (
    !transaction.archivedAt &&
    !transaction.isExcludedFromReports &&
    !transaction.transferMatchId &&
    transaction.type !== "transfer" &&
    transaction.type !== "refund" &&
    Number.isFinite(transaction.postedAt)
  );
}

function normalizeForKey(value: string | undefined) {
  if (!value) return "";
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(card|payment|purchase|pos|transaction|transfer|online|bank)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bucketByAmount(transactions: DetectableTransaction[]) {
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
  const allowedDrift = Math.max(Math.abs(left), Math.abs(right)) * 0.08;
  return Math.abs(Math.abs(left) - Math.abs(right)) <= Math.max(allowedDrift, 1);
}

function consecutiveDayDeltas(transactions: DetectableTransaction[]) {
  return transactions.slice(1).map((transaction, index) => {
    const previous = transactions[index];
    return Math.round((transaction.postedAt - previous.postedAt) / DAY_MS);
  });
}

function pickFrequency(intervals: number[]) {
  const best = FREQUENCY_WINDOWS.map((window) => ({
    ...window,
    matchCount: intervals.filter((days) => days >= window.minDays && days <= window.maxDays)
      .length,
  }))
    .filter((window) => window.matchCount > 0)
    .sort((left, right) => right.matchCount - left.matchCount)[0];
  return best && best.matchCount / intervals.length >= 0.66 ? best : null;
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

function subtractMonthsUtc(epochMs: number, months: number) {
  const date = new Date(epochMs);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date.getTime();
}

function expandEvents(
  events: ForecastEvent[],
  windowStart: number,
  windowEnd: number,
  convertToBase: (amount: number, currency: string) => number
) {
  const result: Array<{ at: number; magnitude: number }> = [];
  for (const event of events) {
    const stepMs = FREQUENCY_DAYS[event.frequency] * DAY_MS;
    const magnitude = Math.abs(convertToBase(event.amount, event.currency));
    if (!stepMs || !Number.isFinite(event.nextExpectedAt) || magnitude === 0) continue;

    let cursor = event.nextExpectedAt;
    while (cursor < windowStart) cursor += stepMs;
    while (cursor < windowEnd) {
      result.push({ at: cursor, magnitude });
      cursor += stepMs;
    }
  }
  return result;
}

function sumEventsInRange(
  events: Array<{ at: number; magnitude: number }>,
  rangeStart: number,
  rangeEnd: number
) {
  return events.reduce(
    (sum, event) => (event.at >= rangeStart && event.at < rangeEnd ? sum + event.magnitude : sum),
    0
  );
}

function startOfUtcDay(epochMs: number) {
  const date = new Date(epochMs);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}
